//! Filesystem trust boundary for authorized workspaces.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkspacePathErrorCode {
    InvalidPath,
    RootNotFound,
    PermissionDenied,
    OutsideRoot,
    LinkEscape,
    PathIdentityUnavailable,
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
        })
    }
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

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathResolution {
    canonical_root_path: PathBuf,
    canonical_path: PathBuf,
    relative_path: PathBuf,
    target_exists: bool,
    path_identity: PathIdentity,
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
    let (canonical_path, target_exists) = resolve_beneath_root(&canonical_root, &relative_path)?;

    Ok(WorkspacePathResolution {
        canonical_root_path: canonical_root,
        canonical_path,
        relative_path,
        target_exists,
        path_identity,
    })
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
        WorkspacePathError, WorkspacePathErrorCode, WorkspacePathResolution,
        classify_candidate_error, resolve_workspace_path,
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

    fn rejected(
        result: Result<WorkspacePathResolution, WorkspacePathError>,
        message: &str,
    ) -> WorkspacePathError {
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
}
