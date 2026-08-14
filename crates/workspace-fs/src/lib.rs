//! Filesystem trust boundary for authorized workspaces.

use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

pub const MAX_TEXT_BYTES: usize = 1024 * 1024;
pub const MAX_LIST_ENTRIES: usize = 200;
pub const MAX_LIST_DEPTH: usize = 3;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkspacePathErrorCode {
    InvalidPath,
    RootNotFound,
    PermissionDenied,
    OutsideRoot,
    LinkEscape,
    PathIdentityUnavailable,
    PermissionProbeFailed,
    PermissionProbeCleanupFailed,
    NotFound,
    NotFile,
    NotDirectory,
    SensitivePath,
    BinaryFile,
    FileTooLarge,
    Conflict,
    WriteFailed,
}

#[derive(Debug, Eq, PartialEq)]
pub struct WorkspacePathError {
    code: WorkspacePathErrorCode,
}

impl WorkspacePathError {
    #[must_use]
    pub const fn new(code: WorkspacePathErrorCode) -> Self {
        Self { code }
    }

    #[must_use]
    pub const fn code(&self) -> WorkspacePathErrorCode {
        self.code
    }
}

impl fmt::Display for WorkspacePathError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.code {
            WorkspacePathErrorCode::InvalidPath => "invalid workspace path",
            WorkspacePathErrorCode::RootNotFound => "workspace root not found",
            WorkspacePathErrorCode::PermissionDenied => "workspace permission denied",
            WorkspacePathErrorCode::OutsideRoot => "path is outside workspace",
            WorkspacePathErrorCode::LinkEscape => "path link escapes workspace",
            WorkspacePathErrorCode::PathIdentityUnavailable => {
                "workspace path identity unavailable"
            }
            WorkspacePathErrorCode::PermissionProbeFailed => "workspace permission probe failed",
            WorkspacePathErrorCode::PermissionProbeCleanupFailed => {
                "workspace permission probe cleanup failed"
            }
            WorkspacePathErrorCode::NotFound => "workspace entry not found",
            WorkspacePathErrorCode::NotFile => "workspace entry is not a file",
            WorkspacePathErrorCode::NotDirectory => "workspace entry is not a directory",
            WorkspacePathErrorCode::SensitivePath => "workspace path is sensitive",
            WorkspacePathErrorCode::BinaryFile => "workspace file is not UTF-8 text",
            WorkspacePathErrorCode::FileTooLarge => "workspace text file is too large",
            WorkspacePathErrorCode::Conflict => "workspace file changed",
            WorkspacePathErrorCode::WriteFailed => "workspace write failed",
        })
    }
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListEntry {
    relative_path: String,
    kind: &'static str,
    size_bytes: Option<u64>,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTextRead {
    relative_path: String,
    content: String,
    size_bytes: u64,
    sha256: String,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTextWrite {
    relative_path: String,
    created: bool,
    previous_sha256: Option<String>,
    sha256: String,
    size_bytes: u64,
}

/// Lists a bounded, non-sensitive view of an authorized workspace.
pub fn list_workspace(
    root: &Path,
    candidate_relative_path: &Path,
) -> Result<Vec<WorkspaceListEntry>, WorkspacePathError> {
    reject_sensitive(candidate_relative_path)?;
    let resolution = resolve_workspace_path(root, candidate_relative_path)?;
    if !resolution.target_exists() {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::NotFound));
    }
    if !resolution.canonical_path().is_dir() {
        return Err(WorkspacePathError::new(
            WorkspacePathErrorCode::NotDirectory,
        ));
    }

    let mut entries = Vec::new();
    collect_entries(
        resolution.canonical_root_path(),
        resolution.canonical_path(),
        0,
        &mut entries,
    )?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(entries)
}

/// Reads one ordinary UTF-8 text file and returns a concurrency hash.
pub fn read_workspace_text(
    root: &Path,
    candidate_relative_path: &Path,
) -> Result<WorkspaceTextRead, WorkspacePathError> {
    reject_sensitive(candidate_relative_path)?;
    let resolution = resolve_workspace_path(root, candidate_relative_path)?;
    if !resolution.target_exists() {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::NotFound));
    }
    if !resolution.canonical_path().is_file() {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::NotFile));
    }
    let metadata = fs::metadata(resolution.canonical_path()).map_err(classify_candidate_error)?;
    if metadata.len() > MAX_TEXT_BYTES as u64 {
        return Err(WorkspacePathError::new(
            WorkspacePathErrorCode::FileTooLarge,
        ));
    }
    let bytes = fs::read(resolution.canonical_path()).map_err(classify_candidate_error)?;
    let content = String::from_utf8(bytes.clone())
        .map_err(|_| WorkspacePathError::new(WorkspacePathErrorCode::BinaryFile))?;
    if content.contains('\0') {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::BinaryFile));
    }
    Ok(WorkspaceTextRead {
        relative_path: portable_relative(resolution.relative_path()),
        content,
        size_bytes: bytes.len() as u64,
        sha256: hash_bytes(&bytes),
    })
}

/// Creates or atomically replaces one ordinary text file after a hash check.
pub fn write_workspace_text(
    root: &Path,
    candidate_relative_path: &Path,
    content: &str,
    base_sha256: Option<&str>,
) -> Result<WorkspaceTextWrite, WorkspacePathError> {
    use atomicwrites::{AtomicFile, OverwriteBehavior};

    if content.len() > MAX_TEXT_BYTES {
        return Err(WorkspacePathError::new(
            WorkspacePathErrorCode::FileTooLarge,
        ));
    }
    if content.contains('\0') {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::BinaryFile));
    }
    reject_sensitive(candidate_relative_path)?;
    let resolution = resolve_workspace_path(root, candidate_relative_path)?;
    if resolution.relative_path().as_os_str().is_empty() {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::NotFile));
    }
    let created = !resolution.target_exists();
    let previous_sha256 = if created {
        if base_sha256.is_some() {
            return Err(WorkspacePathError::new(WorkspacePathErrorCode::Conflict));
        }
        let parent = resolution
            .canonical_path()
            .parent()
            .ok_or_else(|| WorkspacePathError::new(WorkspacePathErrorCode::InvalidPath))?;
        if !parent.is_dir() {
            return Err(WorkspacePathError::new(
                WorkspacePathErrorCode::NotDirectory,
            ));
        }
        None
    } else {
        if !resolution.canonical_path().is_file() {
            return Err(WorkspacePathError::new(WorkspacePathErrorCode::NotFile));
        }
        let bytes = fs::read(resolution.canonical_path()).map_err(classify_candidate_error)?;
        if bytes.len() > MAX_TEXT_BYTES {
            return Err(WorkspacePathError::new(
                WorkspacePathErrorCode::FileTooLarge,
            ));
        }
        if String::from_utf8(bytes.clone())
            .map(|value| value.contains('\0'))
            .unwrap_or(true)
        {
            return Err(WorkspacePathError::new(WorkspacePathErrorCode::BinaryFile));
        }
        let current_hash = hash_bytes(&bytes);
        if base_sha256 != Some(current_hash.as_str()) {
            return Err(WorkspacePathError::new(WorkspacePathErrorCode::Conflict));
        }
        Some(current_hash)
    };

    let target_hash = hash_bytes(content.as_bytes());
    AtomicFile::new(
        resolution.canonical_path(),
        OverwriteBehavior::AllowOverwrite,
    )
    .write(|file| {
        file.write_all(content.as_bytes())?;
        file.sync_all()
    })
    .map_err(|_| WorkspacePathError::new(WorkspacePathErrorCode::WriteFailed))?;

    Ok(WorkspaceTextWrite {
        relative_path: portable_relative(resolution.relative_path()),
        created,
        previous_sha256,
        sha256: target_hash,
        size_bytes: content.len() as u64,
    })
}

fn collect_entries(
    root: &Path,
    directory: &Path,
    depth: usize,
    output: &mut Vec<WorkspaceListEntry>,
) -> Result<(), WorkspacePathError> {
    if depth >= MAX_LIST_DEPTH || output.len() >= MAX_LIST_ENTRIES {
        return Ok(());
    }
    let directory_entries = fs::read_dir(directory).map_err(classify_candidate_error)?;
    for entry in directory_entries {
        if output.len() >= MAX_LIST_ENTRIES {
            break;
        }
        let entry = entry.map_err(classify_candidate_error)?;
        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(|_| WorkspacePathError::new(WorkspacePathErrorCode::OutsideRoot))?
            .to_path_buf();
        if is_sensitive(&relative) || is_ignored_directory(&relative) {
            continue;
        }
        let resolution = resolve_workspace_path(root, &relative)?;
        if !resolution.target_exists() {
            continue;
        }
        let metadata =
            fs::metadata(resolution.canonical_path()).map_err(classify_candidate_error)?;
        let is_directory = metadata.is_dir();
        output.push(WorkspaceListEntry {
            relative_path: portable_relative(&relative),
            kind: if is_directory { "DIRECTORY" } else { "FILE" },
            size_bytes: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });
        if is_directory {
            collect_entries(root, resolution.canonical_path(), depth + 1, output)?;
        }
    }
    Ok(())
}

fn reject_sensitive(path: &Path) -> Result<(), WorkspacePathError> {
    if is_sensitive(path) {
        Err(WorkspacePathError::new(
            WorkspacePathErrorCode::SensitivePath,
        ))
    } else {
        Ok(())
    }
}

fn is_sensitive(path: &Path) -> bool {
    path.components().any(|component| {
        let Component::Normal(segment) = component else {
            return false;
        };
        let name = segment.to_string_lossy().to_ascii_lowercase();
        name == ".git"
            || name == ".env"
            || name.starts_with(".env.")
            || matches!(
                name.as_str(),
                "id_rsa" | "id_ed25519" | "credentials" | "credentials.json"
            )
            || name.ends_with(".pem")
            || name.ends_with(".key")
            || name.ends_with(".p12")
            || name.ends_with(".pfx")
    })
}

fn is_ignored_directory(path: &Path) -> bool {
    path.file_name().is_some_and(|name| {
        matches!(
            name.to_string_lossy().to_ascii_lowercase().as_str(),
            "node_modules" | ".pnpm-store" | "target"
        )
    })
}

fn portable_relative(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(segment) => Some(segment.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

impl std::error::Error for WorkspacePathError {}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "platform", rename_all = "lowercase")]
pub enum PathIdentity {
    #[cfg(target_os = "macos")]
    Macos {
        #[serde(rename = "deviceId")]
        device_id: String,
        inode: String,
    },
    #[cfg(windows)]
    Windows {
        #[serde(rename = "volumeRoot")]
        volume_root: String,
        #[serde(rename = "rootCreationTime")]
        root_creation_time: String,
    },
    #[cfg(not(any(target_os = "macos", windows)))]
    Unix {
        #[serde(rename = "deviceId")]
        device_id: String,
        inode: String,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PermissionMode {
    ReadOnly,
    ReadWrite,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathResolution {
    canonical_root_path: PathBuf,
    canonical_path: PathBuf,
    relative_path: PathBuf,
    target_exists: bool,
    path_identity: PathIdentity,
    #[serde(skip_serializing_if = "Option::is_none")]
    permission_mode: Option<PermissionMode>,
}

impl WorkspacePathResolution {
    #[must_use]
    pub fn canonical_root_path(&self) -> &Path {
        &self.canonical_root_path
    }

    #[must_use]
    pub fn canonical_path(&self) -> &Path {
        &self.canonical_path
    }

    #[must_use]
    pub fn relative_path(&self) -> &Path {
        &self.relative_path
    }

    #[must_use]
    pub const fn target_exists(&self) -> bool {
        self.target_exists
    }

    #[must_use]
    pub const fn path_identity(&self) -> &PathIdentity {
        &self.path_identity
    }

    #[must_use]
    pub const fn permission_mode(&self) -> Option<PermissionMode> {
        self.permission_mode
    }
}

pub fn resolve_workspace_path(
    root: &Path,
    candidate_relative_path: &Path,
) -> Result<WorkspacePathResolution, WorkspacePathError> {
    let canonical_root = fs::canonicalize(root).map_err(classify_root_error)?;
    let root_metadata = fs::metadata(&canonical_root).map_err(classify_root_error)?;
    if !root_metadata.is_dir() {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::InvalidPath));
    }

    let relative_path = normalize_relative(candidate_relative_path)?;
    let path_identity = path_identity(&canonical_root, &root_metadata)?;
    let permission_mode = if relative_path.as_os_str().is_empty() {
        Some(probe_permission(&canonical_root)?)
    } else {
        None
    };
    let (canonical_path, target_exists) = resolve_beneath_root(&canonical_root, &relative_path)?;

    Ok(WorkspacePathResolution {
        canonical_root_path: canonical_root,
        canonical_path,
        relative_path,
        target_exists,
        path_identity,
        permission_mode,
    })
}

const PERMISSION_PROBE_PREFIX: &str = ".ai-corporation-permission-probe-";

fn probe_permission(canonical_root: &Path) -> Result<PermissionMode, WorkspacePathError> {
    fs::read_dir(canonical_root).map_err(classify_candidate_error)?;

    for _ in 0..4 {
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random)
            .map_err(|_| WorkspacePathError::new(WorkspacePathErrorCode::PermissionProbeFailed))?;
        let mut name = String::with_capacity(PERMISSION_PROBE_PREFIX.len() + random.len() * 2);
        name.push_str(PERMISSION_PROBE_PREFIX);
        for byte in random {
            use fmt::Write;
            write!(&mut name, "{byte:02x}").map_err(|_| {
                WorkspacePathError::new(WorkspacePathErrorCode::PermissionProbeFailed)
            })?;
        }
        let probe_path = canonical_root.join(name);

        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe_path)
        {
            Ok(file) => {
                drop(file);
                return cleanup_probe(&probe_path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::PermissionDenied | io::ErrorKind::ReadOnlyFilesystem
                ) =>
            {
                return Ok(PermissionMode::ReadOnly);
            }
            Err(_) => {
                return Err(WorkspacePathError::new(
                    WorkspacePathErrorCode::PermissionProbeFailed,
                ));
            }
        }
    }

    Err(WorkspacePathError::new(
        WorkspacePathErrorCode::PermissionProbeFailed,
    ))
}

fn cleanup_probe(probe_path: &Path) -> Result<PermissionMode, WorkspacePathError> {
    cleanup_probe_with(probe_path, |path| fs::remove_file(path))
}

fn cleanup_probe_with<F>(probe_path: &Path, remove: F) -> Result<PermissionMode, WorkspacePathError>
where
    F: FnOnce(&Path) -> io::Result<()>,
{
    match remove(probe_path) {
        Ok(()) => Ok(PermissionMode::ReadWrite),
        Err(_) => {
            let _ = fs::remove_file(probe_path);
            Err(WorkspacePathError::new(
                WorkspacePathErrorCode::PermissionProbeCleanupFailed,
            ))
        }
    }
}

fn normalize_relative(path: &Path) -> Result<PathBuf, WorkspacePathError> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => normalized.push(segment),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(WorkspacePathError::new(WorkspacePathErrorCode::OutsideRoot));
            }
        }
    }
    Ok(normalized)
}

fn resolve_beneath_root(
    canonical_root: &Path,
    relative_path: &Path,
) -> Result<(PathBuf, bool), WorkspacePathError> {
    let mut current = canonical_root.to_path_buf();
    let mut target_exists = true;

    for component in relative_path.components() {
        let Component::Normal(segment) = component else {
            return Err(WorkspacePathError::new(WorkspacePathErrorCode::InvalidPath));
        };
        current.push(segment);

        if !target_exists {
            continue;
        }

        match fs::symlink_metadata(&current) {
            Ok(_) => {
                let resolved = fs::canonicalize(&current).map_err(classify_candidate_error)?;
                if !resolved.starts_with(canonical_root) {
                    return Err(WorkspacePathError::new(WorkspacePathErrorCode::LinkEscape));
                }
                current = resolved;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                target_exists = false;
            }
            Err(error) => return Err(classify_candidate_error(error)),
        }
    }

    if !current.starts_with(canonical_root) {
        return Err(WorkspacePathError::new(WorkspacePathErrorCode::OutsideRoot));
    }

    Ok((current, target_exists))
}

fn classify_root_error(error: io::Error) -> WorkspacePathError {
    let code = match error.kind() {
        io::ErrorKind::NotFound => WorkspacePathErrorCode::RootNotFound,
        io::ErrorKind::PermissionDenied => WorkspacePathErrorCode::PermissionDenied,
        _ => WorkspacePathErrorCode::InvalidPath,
    };
    WorkspacePathError::new(code)
}

fn classify_candidate_error(error: io::Error) -> WorkspacePathError {
    let code = match error.kind() {
        io::ErrorKind::PermissionDenied => WorkspacePathErrorCode::PermissionDenied,
        _ => WorkspacePathErrorCode::InvalidPath,
    };
    WorkspacePathError::new(code)
}

#[cfg(windows)]
fn path_identity(
    canonical_root: &Path,
    metadata: &fs::Metadata,
) -> Result<PathIdentity, WorkspacePathError> {
    use std::os::windows::fs::MetadataExt;

    let volume_root = match canonical_root.components().next() {
        Some(Component::Prefix(prefix)) => prefix.as_os_str().to_string_lossy().into_owned(),
        _ => {
            return Err(WorkspacePathError::new(
                WorkspacePathErrorCode::PathIdentityUnavailable,
            ));
        }
    };

    Ok(PathIdentity::Windows {
        volume_root,
        root_creation_time: metadata.creation_time().to_string(),
    })
}

#[cfg(target_os = "macos")]
fn path_identity(
    _canonical_root: &Path,
    metadata: &fs::Metadata,
) -> Result<PathIdentity, WorkspacePathError> {
    use std::os::unix::fs::MetadataExt;

    Ok(PathIdentity::Macos {
        device_id: metadata.dev().to_string(),
        inode: metadata.ino().to_string(),
    })
}

#[cfg(not(any(target_os = "macos", windows)))]
fn path_identity(
    _canonical_root: &Path,
    metadata: &fs::Metadata,
) -> Result<PathIdentity, WorkspacePathError> {
    use std::os::unix::fs::MetadataExt;

    Ok(PathIdentity::Unix {
        device_id: metadata.dev().to_string(),
        inode: metadata.ino().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        PERMISSION_PROBE_PREFIX, PermissionMode, WorkspacePathError, WorkspacePathErrorCode,
        classify_candidate_error, cleanup_probe_with, list_workspace, read_workspace_text,
        resolve_workspace_path, write_workspace_text,
    };

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        base: PathBuf,
        root: PathBuf,
        outside: PathBuf,
    }

    impl Fixture {
        fn create() -> io::Result<Self> {
            let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(io::Error::other)?
                .as_nanos();
            let base = std::env::temp_dir().join(format!(
                "M1-TU-01-workspace-fs-{}-{timestamp}-{sequence}",
                std::process::id()
            ));
            let root = base.join("root");
            let outside = base.join("outside");
            fs::create_dir_all(root.join("nested"))?;
            fs::create_dir_all(&outside)?;
            fs::write(root.join("nested").join("inside.txt"), b"inside")?;
            fs::write(outside.join("outside.txt"), b"outside")?;
            Ok(Self {
                base,
                root,
                outside,
            })
        }

        fn cleanup(self) -> io::Result<()> {
            fs::remove_dir_all(self.base)
        }
    }

    fn rejected<T>(result: Result<T, WorkspacePathError>, message: &str) -> WorkspacePathError {
        match result {
            Ok(_) => panic!("{message}"),
            Err(error) => error,
        }
    }

    #[test]
    fn resolves_existing_and_missing_paths_beneath_root() -> io::Result<()> {
        let fixture = Fixture::create()?;

        let existing = resolve_workspace_path(&fixture.root, Path::new("nested/inside.txt"))
            .map_err(io::Error::other)?;
        assert!(existing.target_exists());
        assert_eq!(
            existing.relative_path(),
            Path::new("nested").join("inside.txt")
        );
        assert!(
            existing
                .canonical_path()
                .starts_with(existing.canonical_root_path())
        );

        let missing = resolve_workspace_path(&fixture.root, Path::new("nested/new/file.txt"))
            .map_err(io::Error::other)?;
        assert!(!missing.target_exists());
        assert!(
            missing
                .canonical_path()
                .starts_with(missing.canonical_root_path())
        );

        fixture.cleanup()
    }

    #[test]
    fn probes_real_write_permission_without_leaving_files() -> io::Result<()> {
        let fixture = Fixture::create()?;

        let writable =
            resolve_workspace_path(&fixture.root, Path::new("")).map_err(io::Error::other)?;
        assert_eq!(writable.permission_mode(), Some(PermissionMode::ReadWrite));
        assert!(!contains_probe(&fixture.root)?);

        make_read_only(&fixture.root)?;
        let readonly_result = resolve_workspace_path(&fixture.root, Path::new(""));
        restore_writable(&fixture.root)?;
        let readonly = readonly_result.map_err(io::Error::other)?;
        assert_eq!(readonly.permission_mode(), Some(PermissionMode::ReadOnly));
        assert!(!contains_probe(&fixture.root)?);

        fixture.cleanup()
    }

    #[test]
    fn reports_a_real_unreadable_root_as_permission_denied() -> io::Result<()> {
        let fixture = Fixture::create()?;

        make_inaccessible(&fixture.root)?;
        let inaccessible_result = resolve_workspace_path(&fixture.root, Path::new(""));
        restore_writable(&fixture.root)?;

        let error = rejected(
            inaccessible_result,
            "an unreadable workspace root must be rejected",
        );
        assert_eq!(error.code(), WorkspacePathErrorCode::PermissionDenied);

        fixture.cleanup()
    }

    #[test]
    fn reports_cleanup_failure_separately_and_attempts_fallback_cleanup() -> io::Result<()> {
        let fixture = Fixture::create()?;
        let probe = fixture
            .root
            .join(format!("{PERMISSION_PROBE_PREFIX}cleanup"));
        fs::write(&probe, b"")?;

        let error = match cleanup_probe_with(&probe, |_| {
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "simulated first cleanup failure",
            ))
        }) {
            Ok(_) => panic!("cleanup failure must be reported"),
            Err(error) => error,
        };
        assert_eq!(
            error.code(),
            WorkspacePathErrorCode::PermissionProbeCleanupFailed
        );
        assert!(!probe.exists());

        fixture.cleanup()
    }

    #[test]
    fn rejects_parent_and_absolute_paths_without_disclosing_them() -> io::Result<()> {
        let fixture = Fixture::create()?;

        let parent_error = rejected(
            resolve_workspace_path(&fixture.root, Path::new("../outside/outside.txt")),
            "parent traversal must be rejected",
        );
        assert_eq!(parent_error.code(), WorkspacePathErrorCode::OutsideRoot);
        assert!(!parent_error.to_string().contains("outside.txt"));

        let absolute_error = rejected(
            resolve_workspace_path(&fixture.root, &fixture.outside),
            "absolute path must be rejected",
        );
        assert_eq!(absolute_error.code(), WorkspacePathErrorCode::OutsideRoot);
        assert!(
            !absolute_error
                .to_string()
                .contains(fixture.outside.to_string_lossy().as_ref())
        );

        #[cfg(windows)]
        for prefixed_path in [r"Z:\outside.txt", r"\\server\share\outside.txt"] {
            let error = rejected(
                resolve_workspace_path(&fixture.root, Path::new(prefixed_path)),
                "drive and UNC paths must be rejected",
            );
            assert_eq!(error.code(), WorkspacePathErrorCode::OutsideRoot);
        }

        fixture.cleanup()
    }

    #[test]
    fn rejects_links_that_resolve_outside_root() -> io::Result<()> {
        let fixture = Fixture::create()?;
        let link = fixture.root.join("escape");
        create_directory_link(&fixture.outside, &link)?;

        let error = rejected(
            resolve_workspace_path(&fixture.root, Path::new("escape/outside.txt")),
            "link escape must be rejected",
        );
        assert_eq!(error.code(), WorkspacePathErrorCode::LinkEscape);

        remove_directory_link(&link)?;
        fixture.cleanup()
    }

    #[test]
    fn returns_stable_errors_for_missing_invalid_and_denied_roots() -> io::Result<()> {
        let fixture = Fixture::create()?;
        let missing = fixture.base.join("missing");
        let missing_error = rejected(
            resolve_workspace_path(&missing, Path::new("")),
            "missing root must be rejected",
        );
        assert_eq!(missing_error.code(), WorkspacePathErrorCode::RootNotFound);

        let file_root = fixture.root.join("nested/inside.txt");
        let invalid_error = rejected(
            resolve_workspace_path(&file_root, Path::new("")),
            "file root must be rejected",
        );
        assert_eq!(invalid_error.code(), WorkspacePathErrorCode::InvalidPath);

        let denied = classify_candidate_error(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "sensitive operating-system path",
        ));
        assert_eq!(denied.code(), WorkspacePathErrorCode::PermissionDenied);
        assert!(!denied.to_string().contains("sensitive"));

        fixture.cleanup()
    }

    #[test]
    fn lists_reads_creates_and_modifies_text_with_conflict_protection() -> io::Result<()> {
        let fixture = Fixture::create()?;
        let entries = list_workspace(&fixture.root, Path::new("")).map_err(io::Error::other)?;
        assert!(
            entries
                .iter()
                .any(|entry| entry.relative_path == "nested/inside.txt")
        );

        let original = read_workspace_text(&fixture.root, Path::new("nested/inside.txt"))
            .map_err(io::Error::other)?;
        assert_eq!(original.content, "inside");
        assert_eq!(original.sha256.len(), 64);

        let created = write_workspace_text(&fixture.root, Path::new("result.md"), "first", None)
            .map_err(io::Error::other)?;
        assert!(created.created);
        assert_eq!(fs::read_to_string(fixture.root.join("result.md"))?, "first");

        let modified = write_workspace_text(
            &fixture.root,
            Path::new("result.md"),
            "second",
            Some(&created.sha256),
        )
        .map_err(io::Error::other)?;
        assert!(!modified.created);

        fs::write(fixture.root.join("result.md"), "user change")?;
        let conflict = rejected(
            write_workspace_text(
                &fixture.root,
                Path::new("result.md"),
                "stale overwrite",
                Some(&modified.sha256),
            ),
            "a stale hash must not overwrite the user's newer file",
        );
        assert_eq!(conflict.code(), WorkspacePathErrorCode::Conflict);
        assert_eq!(
            fs::read_to_string(fixture.root.join("result.md"))?,
            "user change"
        );
        fixture.cleanup()
    }

    #[test]
    fn rejects_sensitive_and_binary_files() -> io::Result<()> {
        let fixture = Fixture::create()?;
        fs::write(fixture.root.join(".env"), "SECRET=value")?;
        fs::write(fixture.root.join("binary.dat"), [0xff, 0xfe, 0xfd])?;

        let listed = list_workspace(&fixture.root, Path::new("")).map_err(io::Error::other)?;
        assert!(!listed.iter().any(|entry| entry.relative_path == ".env"));
        assert_eq!(
            rejected(
                read_workspace_text(&fixture.root, Path::new(".env")),
                "sensitive files must be rejected",
            )
            .code(),
            WorkspacePathErrorCode::SensitivePath,
        );
        assert_eq!(
            rejected(
                read_workspace_text(&fixture.root, Path::new("binary.dat")),
                "binary files must be rejected",
            )
            .code(),
            WorkspacePathErrorCode::BinaryFile,
        );
        fixture.cleanup()
    }

    #[cfg(unix)]
    fn create_directory_link(target: &Path, link: &Path) -> io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_directory_link(target: &Path, link: &Path) -> io::Result<()> {
        use std::process::Command;

        // Directory junctions exercise the reparse-point boundary without
        // requiring the elevated symlink privilege on Windows CI runners.
        let output = Command::new("cmd.exe")
            .args(["/d", "/s", "/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()?;
        if output.status.success() {
            Ok(())
        } else {
            Err(io::Error::other("could not create junction fixture"))
        }
    }

    #[cfg(unix)]
    fn remove_directory_link(link: &Path) -> io::Result<()> {
        fs::remove_file(link)
    }

    #[cfg(windows)]
    fn remove_directory_link(link: &Path) -> io::Result<()> {
        fs::remove_dir(link)
    }

    fn contains_probe(root: &Path) -> io::Result<bool> {
        for entry in fs::read_dir(root)? {
            if entry?
                .file_name()
                .to_string_lossy()
                .starts_with(PERMISSION_PROBE_PREFIX)
            {
                return Ok(true);
            }
        }
        Ok(false)
    }

    #[cfg(unix)]
    fn make_read_only(root: &Path) -> io::Result<()> {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(root, fs::Permissions::from_mode(0o555))
    }

    #[cfg(unix)]
    fn make_inaccessible(root: &Path) -> io::Result<()> {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(root, fs::Permissions::from_mode(0o000))
    }

    #[cfg(unix)]
    fn restore_writable(root: &Path) -> io::Result<()> {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(root, fs::Permissions::from_mode(0o755))
    }

    #[cfg(windows)]
    fn make_read_only(root: &Path) -> io::Result<()> {
        let user = current_windows_principal()?;
        run_icacls(root, &["/deny".to_owned(), format!("{user}:(WD,AD)")])
    }

    #[cfg(windows)]
    fn make_inaccessible(root: &Path) -> io::Result<()> {
        let user = current_windows_principal()?;
        run_icacls(root, &["/deny".to_owned(), format!("{user}:(RX)")])
    }

    #[cfg(windows)]
    fn restore_writable(root: &Path) -> io::Result<()> {
        let user = current_windows_principal()?;
        run_icacls(root, &["/remove:d".to_owned(), user])
    }

    #[cfg(windows)]
    fn current_windows_principal() -> io::Result<String> {
        use std::process::Command;

        let output = Command::new("whoami.exe").output()?;
        if !output.status.success() {
            return Err(io::Error::other("test principal is unavailable"));
        }
        let principal = String::from_utf8(output.stdout)
            .map_err(io::Error::other)?
            .trim()
            .to_owned();
        if principal.is_empty() {
            Err(io::Error::other("test principal is unavailable"))
        } else {
            Ok(principal)
        }
    }

    #[cfg(windows)]
    fn run_icacls(root: &Path, arguments: &[String]) -> io::Result<()> {
        use std::process::Command;

        let status = Command::new("icacls.exe")
            .arg(root)
            .args(arguments)
            .status()?;
        if status.success() {
            Ok(())
        } else {
            Err(io::Error::other("could not configure permission fixture"))
        }
    }
}
