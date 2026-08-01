//! Authenticated JSON-RPC boundary for native desktop capabilities.

use std::io::{self, BufRead, Read, Write};

use secure_store::{OsSecureStore, SecureStore, SecureStoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;
use workspace_fs::{WorkspacePathError, resolve_workspace_path};

pub const CRATE_NAME: &str = "native-core";
pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_REQUEST_BYTES: usize = 64 * 1024;
pub const MAX_SECRET_BYTES: usize = 2_048;

const JSON_RPC_VERSION: &str = "2.0";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RpcRequest {
    jsonrpc: String,
    id: Value,
    method: String,
    params: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HealthParams {
    schema_version: u32,
    session_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceCanonicalizeParams {
    schema_version: u32,
    session_token: String,
    root_path: String,
    candidate_relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SecureStoreStatusParams {
    schema_version: u32,
    session_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SecureStoreReferenceParams {
    schema_version: u32,
    session_token: String,
    secret_ref: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SecureStoreSetParams {
    schema_version: u32,
    session_token: String,
    secret_ref: String,
    secret: String,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i32,
    message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl RpcResponse {
    fn success(id: Value, result: Value) -> Self {
        Self {
            jsonrpc: JSON_RPC_VERSION,
            id,
            result: Some(result),
            error: None,
        }
    }

    fn error(id: Value, code: i32, message: &'static str) -> Self {
        Self {
            jsonrpc: JSON_RPC_VERSION,
            id,
            result: None,
            error: Some(RpcError {
                code,
                message,
                data: None,
            }),
        }
    }

    fn workspace_error(id: Value, error: &WorkspacePathError) -> Self {
        Self {
            jsonrpc: JSON_RPC_VERSION,
            id,
            result: None,
            error: Some(RpcError {
                code: -32010,
                message: "Workspace path rejected",
                data: Some(json!({ "reason": error.code() })),
            }),
        }
    }

    fn secure_store_error(id: Value, error: SecureStoreError) -> Self {
        Self {
            jsonrpc: JSON_RPC_VERSION,
            id,
            result: None,
            error: Some(RpcError {
                code: -32020,
                message: "Secure store operation failed",
                data: Some(json!({ "reason": secure_store_error_reason(error) })),
            }),
        }
    }
}

fn secure_store_error_reason(error: SecureStoreError) -> &'static str {
    match error {
        SecureStoreError::Unavailable => "UNAVAILABLE",
        SecureStoreError::NotFound => "NOT_FOUND",
        SecureStoreError::Rejected => "REJECTED",
        SecureStoreError::Internal => "INTERNAL",
    }
}

fn valid_id(id: &Value) -> bool {
    id.is_string() || id.is_number() || id.is_null()
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }

    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (left_byte, right_byte)| {
            difference | (left_byte ^ right_byte)
        })
        == 0
}

fn process_value<S: SecureStore + ?Sized>(
    value: Value,
    expected_session_token: &str,
    secure_store: &S,
) -> RpcResponse {
    let request = match serde_json::from_value::<RpcRequest>(value) {
        Ok(request) => request,
        Err(_) => return RpcResponse::error(Value::Null, -32600, "Invalid request"),
    };

    if request.jsonrpc != JSON_RPC_VERSION || !valid_id(&request.id) {
        return RpcResponse::error(Value::Null, -32600, "Invalid request");
    }

    match request.method.as_str() {
        "health" => process_health(request.id, request.params, expected_session_token),
        "workspace.canonicalize" => {
            process_workspace_canonicalize(request.id, request.params, expected_session_token)
        }
        "secure_store.status" => process_secure_store_status(
            request.id,
            request.params,
            expected_session_token,
            secure_store,
        ),
        "secure_store.set" => process_secure_store_set(
            request.id,
            request.params,
            expected_session_token,
            secure_store,
        ),
        "secure_store.get" => process_secure_store_get(
            request.id,
            request.params,
            expected_session_token,
            secure_store,
        ),
        "secure_store.delete" => process_secure_store_delete(
            request.id,
            request.params,
            expected_session_token,
            secure_store,
        ),
        _ => RpcResponse::error(request.id, -32601, "Method not found"),
    }
}

fn process_health(id: Value, params: Value, expected_session_token: &str) -> RpcResponse {
    let params = match serde_json::from_value::<HealthParams>(params) {
        Ok(params) => params,
        Err(_) => return RpcResponse::error(id, -32602, "Invalid params"),
    };

    if params.schema_version != SCHEMA_VERSION {
        return RpcResponse::error(id, -32602, "Unsupported schema version");
    }

    if !constant_time_eq(&params.session_token, expected_session_token) {
        return RpcResponse::error(id, -32001, "Unauthorized");
    }

    RpcResponse::success(
        id,
        json!({
            "schemaVersion": SCHEMA_VERSION,
            "status": "ok",
            "version": env!("CARGO_PKG_VERSION"),
            "pid": std::process::id(),
        }),
    )
}

fn process_workspace_canonicalize(
    id: Value,
    params: Value,
    expected_session_token: &str,
) -> RpcResponse {
    let params = match serde_json::from_value::<WorkspaceCanonicalizeParams>(params) {
        Ok(params) => params,
        Err(_) => return RpcResponse::error(id, -32602, "Invalid params"),
    };

    if params.schema_version != SCHEMA_VERSION {
        return RpcResponse::error(id, -32602, "Unsupported schema version");
    }

    if !constant_time_eq(&params.session_token, expected_session_token) {
        return RpcResponse::error(id, -32001, "Unauthorized");
    }

    match resolve_workspace_path(
        std::path::Path::new(&params.root_path),
        std::path::Path::new(&params.candidate_relative_path),
    ) {
        Ok(result) => match serde_json::to_value(result) {
            Ok(mut value) => {
                if let Value::Object(object) = &mut value {
                    object.insert("schemaVersion".to_owned(), Value::from(SCHEMA_VERSION));
                }
                RpcResponse::success(id, value)
            }
            Err(_) => RpcResponse::error(id, -32603, "Internal error"),
        },
        Err(error) => RpcResponse::workspace_error(id, &error),
    }
}

fn process_secure_store_status<S: SecureStore + ?Sized>(
    id: Value,
    params: Value,
    expected_session_token: &str,
    secure_store: &S,
) -> RpcResponse {
    let params = match serde_json::from_value::<SecureStoreStatusParams>(params) {
        Ok(params) => params,
        Err(_) => return RpcResponse::error(id, -32602, "Invalid params"),
    };
    if let Some(error) = validate_secure_store_context(
        &id,
        params.schema_version,
        &params.session_token,
        expected_session_token,
    ) {
        return error;
    }

    match secure_store.ensure_available() {
        Ok(()) => RpcResponse::success(
            id,
            json!({ "schemaVersion": SCHEMA_VERSION, "available": true }),
        ),
        Err(error) => RpcResponse::secure_store_error(id, error),
    }
}

fn process_secure_store_set<S: SecureStore + ?Sized>(
    id: Value,
    params: Value,
    expected_session_token: &str,
    secure_store: &S,
) -> RpcResponse {
    let params = match serde_json::from_value::<SecureStoreSetParams>(params) {
        Ok(params) => params,
        Err(_) => return RpcResponse::error(id, -32602, "Invalid params"),
    };
    if let Some(error) = validate_secure_store_context(
        &id,
        params.schema_version,
        &params.session_token,
        expected_session_token,
    ) {
        return error;
    }
    if !valid_secret_ref(&params.secret_ref) || !valid_secret(&params.secret) {
        return RpcResponse::error(id, -32602, "Invalid params");
    }

    match secure_store.set(&params.secret_ref, params.secret.as_bytes()) {
        Ok(()) => RpcResponse::success(
            id,
            json!({ "schemaVersion": SCHEMA_VERSION, "stored": true }),
        ),
        Err(error) => RpcResponse::secure_store_error(id, error),
    }
}

fn process_secure_store_get<S: SecureStore + ?Sized>(
    id: Value,
    params: Value,
    expected_session_token: &str,
    secure_store: &S,
) -> RpcResponse {
    let params = match serde_json::from_value::<SecureStoreReferenceParams>(params) {
        Ok(params) => params,
        Err(_) => return RpcResponse::error(id, -32602, "Invalid params"),
    };
    if let Some(error) = validate_secure_store_context(
        &id,
        params.schema_version,
        &params.session_token,
        expected_session_token,
    ) {
        return error;
    }
    if !valid_secret_ref(&params.secret_ref) {
        return RpcResponse::error(id, -32602, "Invalid params");
    }

    match secure_store.get(&params.secret_ref) {
        Ok(secret) => match String::from_utf8(secret) {
            Ok(secret) if valid_secret(&secret) => RpcResponse::success(
                id,
                json!({ "schemaVersion": SCHEMA_VERSION, "secret": secret }),
            ),
            Ok(_) | Err(_) => RpcResponse::secure_store_error(id, SecureStoreError::Internal),
        },
        Err(error) => RpcResponse::secure_store_error(id, error),
    }
}

fn process_secure_store_delete<S: SecureStore + ?Sized>(
    id: Value,
    params: Value,
    expected_session_token: &str,
    secure_store: &S,
) -> RpcResponse {
    let params = match serde_json::from_value::<SecureStoreReferenceParams>(params) {
        Ok(params) => params,
        Err(_) => return RpcResponse::error(id, -32602, "Invalid params"),
    };
    if let Some(error) = validate_secure_store_context(
        &id,
        params.schema_version,
        &params.session_token,
        expected_session_token,
    ) {
        return error;
    }
    if !valid_secret_ref(&params.secret_ref) {
        return RpcResponse::error(id, -32602, "Invalid params");
    }

    match secure_store.delete(&params.secret_ref) {
        Ok(()) => RpcResponse::success(
            id,
            json!({ "schemaVersion": SCHEMA_VERSION, "deleted": true }),
        ),
        Err(error) => RpcResponse::secure_store_error(id, error),
    }
}

fn validate_secure_store_context(
    id: &Value,
    schema_version: u32,
    session_token: &str,
    expected_session_token: &str,
) -> Option<RpcResponse> {
    if schema_version != SCHEMA_VERSION {
        return Some(RpcResponse::error(
            id.clone(),
            -32602,
            "Unsupported schema version",
        ));
    }
    if !constant_time_eq(session_token, expected_session_token) {
        return Some(RpcResponse::error(id.clone(), -32001, "Unauthorized"));
    }
    None
}

fn valid_secret_ref(secret_ref: &str) -> bool {
    Uuid::parse_str(secret_ref).is_ok()
}

fn valid_secret(secret: &str) -> bool {
    !secret.is_empty() && secret.len() <= MAX_SECRET_BYTES && !secret.chars().any(char::is_control)
}

fn serialize_response(response: &RpcResponse) -> String {
    match serde_json::to_string(response) {
        Ok(serialized) => serialized,
        Err(_) => {
            "{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}"
                .to_owned()
        }
    }
}

pub fn handle_line(line: &str, expected_session_token: &str) -> String {
    let secure_store = OsSecureStore;
    handle_line_with_store(line, expected_session_token, &secure_store)
}

fn handle_line_with_store<S: SecureStore + ?Sized>(
    line: &str,
    expected_session_token: &str,
    secure_store: &S,
) -> String {
    let value = match serde_json::from_str::<Value>(line) {
        Ok(value) => value,
        Err(_) => {
            return serialize_response(&RpcResponse::error(Value::Null, -32700, "Parse error"));
        }
    };

    serialize_response(&process_value(value, expected_session_token, secure_store))
}

pub fn run<R: BufRead, W: Write>(
    mut reader: R,
    mut writer: W,
    expected_session_token: &str,
) -> io::Result<()> {
    let secure_store = OsSecureStore;
    loop {
        let mut request_bytes = Vec::new();
        let bytes_read = reader
            .by_ref()
            .take((MAX_REQUEST_BYTES + 1) as u64)
            .read_until(b'\n', &mut request_bytes)?;

        if bytes_read == 0 {
            return Ok(());
        }

        let response = if request_bytes.len() > MAX_REQUEST_BYTES {
            if request_bytes.last() != Some(&b'\n') {
                drain_until_newline(&mut reader)?;
            }
            serialize_response(&RpcResponse::error(
                Value::Null,
                -32600,
                "Request too large",
            ))
        } else {
            let request = String::from_utf8_lossy(&request_bytes);
            handle_line_with_store(
                request.trim_end_matches(['\r', '\n']),
                expected_session_token,
                &secure_store,
            )
        };

        writeln!(writer, "{response}")?;
        writer.flush()?;
    }
}

fn drain_until_newline<R: BufRead>(reader: &mut R) -> io::Result<()> {
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok(());
        }

        let consumed = buffer
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(buffer.len(), |position| position + 1);
        let found_newline = consumed <= buffer.len() && buffer[consumed - 1] == b'\n';
        reader.consume(consumed);

        if found_newline {
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::fs;
    use std::io;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use secure_store::{SecureStore, SecureStoreError};
    use serde_json::{Value, json};

    use super::{
        MAX_REQUEST_BYTES, MAX_SECRET_BYTES, SCHEMA_VERSION, handle_line, handle_line_with_store,
        run,
    };

    const TOKEN: &str = "0123456789abcdef";
    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    const SECRET_REF: &str = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";

    #[derive(Default)]
    struct FakeSecureStore {
        available: bool,
        entries: Mutex<HashMap<String, Vec<u8>>>,
    }

    impl FakeSecureStore {
        fn available() -> Self {
            Self {
                available: true,
                entries: Mutex::new(HashMap::new()),
            }
        }

        fn entries(
            &self,
        ) -> Result<std::sync::MutexGuard<'_, HashMap<String, Vec<u8>>>, SecureStoreError> {
            self.entries.lock().map_err(|_| SecureStoreError::Internal)
        }
    }

    impl SecureStore for FakeSecureStore {
        fn ensure_available(&self) -> Result<(), SecureStoreError> {
            if self.available {
                Ok(())
            } else {
                Err(SecureStoreError::Unavailable)
            }
        }

        fn set(&self, secret_ref: &str, secret: &[u8]) -> Result<(), SecureStoreError> {
            self.ensure_available()?;
            self.entries()?
                .insert(secret_ref.to_owned(), secret.to_vec());
            Ok(())
        }

        fn get(&self, secret_ref: &str) -> Result<Vec<u8>, SecureStoreError> {
            self.ensure_available()?;
            self.entries()?
                .get(secret_ref)
                .cloned()
                .ok_or(SecureStoreError::NotFound)
        }

        fn delete(&self, secret_ref: &str) -> Result<(), SecureStoreError> {
            self.ensure_available()?;
            self.entries()?
                .remove(secret_ref)
                .map(|_| ())
                .ok_or(SecureStoreError::NotFound)
        }
    }

    fn parse_response(response: &str) -> Value {
        match serde_json::from_str(response) {
            Ok(value) => value,
            Err(error) => panic!("response must be JSON: {error}"),
        }
    }

    fn temporary_workspace() -> io::Result<PathBuf> {
        let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "M1-TU-01-native-core-{}-{timestamp}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("nested"))?;
        Ok(root)
    }

    #[test]
    fn health_returns_process_metadata_for_valid_session() {
        let response = parse_response(&handle_line(
            &json!({
                "jsonrpc": "2.0",
                "id": "request-1",
                "method": "health",
                "params": {
                    "schemaVersion": SCHEMA_VERSION,
                    "sessionToken": TOKEN,
                },
            })
            .to_string(),
            TOKEN,
        ));

        assert_eq!(response["result"]["status"], "ok");
        assert_eq!(response["result"]["schemaVersion"], SCHEMA_VERSION);
        assert!(response["result"]["pid"].is_number());
    }

    #[test]
    fn health_rejects_invalid_session() {
        let response = parse_response(&handle_line(
            &json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "health",
                "params": {
                    "schemaVersion": SCHEMA_VERSION,
                    "sessionToken": "invalid",
                },
            })
            .to_string(),
            TOKEN,
        ));

        assert_eq!(response["error"]["code"], -32001);
        assert_eq!(response["error"]["message"], "Unauthorized");
    }

    #[test]
    fn unknown_method_is_rejected() {
        let response = parse_response(&handle_line(
            &json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "workspace.delete_everything",
                "params": {},
            })
            .to_string(),
            TOKEN,
        ));

        assert_eq!(response["error"]["code"], -32601);
    }

    #[test]
    fn malformed_json_returns_parse_error() {
        let response = parse_response(&handle_line("{", TOKEN));
        assert_eq!(response["error"]["code"], -32700);
    }

    #[test]
    fn oversized_request_is_rejected_without_terminating_server() {
        let mut input = vec![b'a'; MAX_REQUEST_BYTES * 2];
        input.push(b'\n');
        input.extend_from_slice(
            format!(
                "{}\n",
                json!({
                    "jsonrpc": "2.0",
                    "id": "after-oversized",
                    "method": "health",
                    "params": {
                        "schemaVersion": SCHEMA_VERSION,
                        "sessionToken": TOKEN,
                    },
                })
            )
            .as_bytes(),
        );
        let mut output = Vec::new();

        let result = run(input.as_slice(), &mut output, TOKEN);

        assert!(result.is_ok());
        let response = String::from_utf8_lossy(&output);
        assert!(response.contains("Request too large"));
        assert!(response.contains("after-oversized"));
        assert_eq!(response.lines().count(), 2);
    }

    #[test]
    fn workspace_canonicalize_returns_only_trusted_boundary_metadata() -> io::Result<()> {
        let root = temporary_workspace()?;
        let response = parse_response(&handle_line(
            &json!({
                "jsonrpc": "2.0",
                "id": "workspace-1",
                "method": "workspace.canonicalize",
                "params": {
                    "schemaVersion": SCHEMA_VERSION,
                    "sessionToken": TOKEN,
                    "rootPath": root.to_string_lossy(),
                    "candidateRelativePath": "",
                },
            })
            .to_string(),
            TOKEN,
        ));

        assert_eq!(response["result"]["schemaVersion"], SCHEMA_VERSION);
        assert_eq!(response["result"]["relativePath"], "");
        assert_eq!(response["result"]["targetExists"], true);
        assert_eq!(response["result"]["permissionMode"], "READ_WRITE");
        assert!(response["result"]["canonicalRootPath"].is_string());
        assert!(response["result"]["canonicalPath"].is_string());
        assert!(response["result"]["pathIdentity"]["platform"].is_string());

        fs::remove_dir_all(root)
    }

    #[test]
    fn workspace_canonicalize_rejects_escape_without_path_disclosure() -> io::Result<()> {
        let root = temporary_workspace()?;
        let response_text = handle_line(
            &json!({
                "jsonrpc": "2.0",
                "id": "workspace-escape",
                "method": "workspace.canonicalize",
                "params": {
                    "schemaVersion": SCHEMA_VERSION,
                    "sessionToken": TOKEN,
                    "rootPath": root.to_string_lossy(),
                    "candidateRelativePath": "../sensitive.txt",
                },
            })
            .to_string(),
            TOKEN,
        );
        let response = parse_response(&response_text);

        assert_eq!(response["error"]["code"], -32010);
        assert_eq!(response["error"]["message"], "Workspace path rejected");
        assert_eq!(response["error"]["data"]["reason"], "OUTSIDE_ROOT");
        assert!(!response_text.contains("sensitive.txt"));
        assert!(!response_text.contains(&root.to_string_lossy().to_string()));

        fs::remove_dir_all(root)
    }

    #[test]
    fn secure_store_lifecycle_is_authenticated_and_rotates_without_leaking() {
        let store = FakeSecureStore::available();
        let first_secret = "M2-TU-01-test-first";
        let rotated_secret = "M2-TU-01-test-rotated";

        let status = parse_response(&handle_line_with_store(
            &secure_store_request("status", json!({})),
            TOKEN,
            &store,
        ));
        assert_eq!(status["result"]["available"], true);

        let first_set = handle_line_with_store(
            &secure_store_request(
                "set",
                json!({ "secretRef": SECRET_REF, "secret": first_secret }),
            ),
            TOKEN,
            &store,
        );
        assert_eq!(parse_response(&first_set)["result"]["stored"], true);
        assert!(!first_set.contains(first_secret));

        let first_get = handle_line_with_store(
            &secure_store_request("get", json!({ "secretRef": SECRET_REF })),
            TOKEN,
            &store,
        );
        assert_eq!(parse_response(&first_get)["result"]["secret"], first_secret);

        let rotated_set = handle_line_with_store(
            &secure_store_request(
                "set",
                json!({ "secretRef": SECRET_REF, "secret": rotated_secret }),
            ),
            TOKEN,
            &store,
        );
        assert!(!rotated_set.contains(rotated_secret));
        let rotated_get = parse_response(&handle_line_with_store(
            &secure_store_request("get", json!({ "secretRef": SECRET_REF })),
            TOKEN,
            &store,
        ));
        assert_eq!(rotated_get["result"]["secret"], rotated_secret);

        let deleted = parse_response(&handle_line_with_store(
            &secure_store_request("delete", json!({ "secretRef": SECRET_REF })),
            TOKEN,
            &store,
        ));
        assert_eq!(deleted["result"]["deleted"], true);
        let missing = parse_response(&handle_line_with_store(
            &secure_store_request("get", json!({ "secretRef": SECRET_REF })),
            TOKEN,
            &store,
        ));
        assert_eq!(missing["error"]["data"]["reason"], "NOT_FOUND");
    }

    #[test]
    fn secure_store_rejects_invalid_or_unauthorized_secrets_without_echoing() {
        let store = FakeSecureStore::available();
        let invalid_secret = "do-not-echo\nsecret";
        let invalid = handle_line_with_store(
            &secure_store_request(
                "set",
                json!({ "secretRef": SECRET_REF, "secret": invalid_secret }),
            ),
            TOKEN,
            &store,
        );
        assert_eq!(parse_response(&invalid)["error"]["code"], -32602);
        assert!(!invalid.contains(invalid_secret));

        let oversized_secret = "s".repeat(MAX_SECRET_BYTES + 1);
        let oversized = handle_line_with_store(
            &secure_store_request(
                "set",
                json!({ "secretRef": SECRET_REF, "secret": oversized_secret }),
            ),
            TOKEN,
            &store,
        );
        assert_eq!(parse_response(&oversized)["error"]["code"], -32602);
        assert!(!oversized.contains(&oversized_secret));

        let unauthorized_request = json!({
            "jsonrpc": "2.0",
            "id": "secure-store-unauthorized",
            "method": "secure_store.set",
            "params": {
                "schemaVersion": SCHEMA_VERSION,
                "sessionToken": "b".repeat(64),
                "secretRef": SECRET_REF,
                "secret": "do-not-store-or-echo"
            }
        })
        .to_string();
        let unauthorized = handle_line_with_store(&unauthorized_request, TOKEN, &store);
        assert_eq!(parse_response(&unauthorized)["error"]["code"], -32001);
        assert!(!unauthorized.contains("do-not-store-or-echo"));
        assert_eq!(store.get(SECRET_REF), Err(SecureStoreError::NotFound));
    }

    #[test]
    fn secure_store_unavailable_has_a_fixed_safe_error() {
        let store = FakeSecureStore::default();
        let response =
            handle_line_with_store(&secure_store_request("status", json!({})), TOKEN, &store);
        let parsed = parse_response(&response);
        assert_eq!(parsed["error"]["code"], -32020);
        assert_eq!(parsed["error"]["message"], "Secure store operation failed");
        assert_eq!(parsed["error"]["data"]["reason"], "UNAVAILABLE");
    }

    fn secure_store_request(operation: &str, extra_params: Value) -> String {
        let mut params = json!({
            "schemaVersion": SCHEMA_VERSION,
            "sessionToken": TOKEN,
        });
        if let (Value::Object(params), Value::Object(extra)) = (&mut params, extra_params) {
            params.extend(extra);
        }
        json!({
            "jsonrpc": "2.0",
            "id": format!("secure-store-{operation}"),
            "method": format!("secure_store.{operation}"),
            "params": params,
        })
        .to_string()
    }
}
