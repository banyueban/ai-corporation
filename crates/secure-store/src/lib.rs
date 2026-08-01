//! Narrow OS credential-store adapter for Provider secrets.

pub const CRATE_NAME: &str = "secure-store";
pub const SERVICE_NAMESPACE: &str = "com.aicorporation.desktop.provider";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SecureStoreError {
    Unavailable,
    NotFound,
    Rejected,
    Internal,
}

pub trait SecureStore {
    fn ensure_available(&self) -> Result<(), SecureStoreError>;
    fn set(&self, secret_ref: &str, secret: &[u8]) -> Result<(), SecureStoreError>;
    fn get(&self, secret_ref: &str) -> Result<Vec<u8>, SecureStoreError>;
    fn delete(&self, secret_ref: &str) -> Result<(), SecureStoreError>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct OsSecureStore;

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod platform {
    use keyring::v1::{Entry, Error};

    use super::{OsSecureStore, SERVICE_NAMESPACE, SecureStore, SecureStoreError};

    impl OsSecureStore {
        fn entry(secret_ref: &str) -> Result<Entry, SecureStoreError> {
            Entry::new(SERVICE_NAMESPACE, secret_ref).map_err(map_error)
        }
    }

    impl SecureStore for OsSecureStore {
        fn ensure_available(&self) -> Result<(), SecureStoreError> {
            Entry::store_status()
                .as_ref()
                .map(|_| ())
                .map_err(map_error_ref)
        }

        fn set(&self, secret_ref: &str, secret: &[u8]) -> Result<(), SecureStoreError> {
            Self::entry(secret_ref)?
                .set_secret(secret)
                .map_err(map_error)
        }

        fn get(&self, secret_ref: &str) -> Result<Vec<u8>, SecureStoreError> {
            Self::entry(secret_ref)?.get_secret().map_err(map_error)
        }

        fn delete(&self, secret_ref: &str) -> Result<(), SecureStoreError> {
            Self::entry(secret_ref)?
                .delete_credential()
                .map_err(map_error)
        }
    }

    fn map_error(error: Error) -> SecureStoreError {
        map_error_ref(&error)
    }

    fn map_error_ref(error: &Error) -> SecureStoreError {
        match error {
            Error::NoEntry => SecureStoreError::NotFound,
            Error::NoDefaultStore | Error::NoStorageAccess(_) => SecureStoreError::Unavailable,
            Error::Invalid(_, _) | Error::NotSupportedByStore(_) | Error::TooLong(_, _) => {
                SecureStoreError::Rejected
            }
            _ => SecureStoreError::Internal,
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
impl SecureStore for OsSecureStore {
    fn ensure_available(&self) -> Result<(), SecureStoreError> {
        Err(SecureStoreError::Unavailable)
    }

    fn set(&self, _secret_ref: &str, _secret: &[u8]) -> Result<(), SecureStoreError> {
        Err(SecureStoreError::Unavailable)
    }

    fn get(&self, _secret_ref: &str) -> Result<Vec<u8>, SecureStoreError> {
        Err(SecureStoreError::Unavailable)
    }

    fn delete(&self, _secret_ref: &str) -> Result<(), SecureStoreError> {
        Err(SecureStoreError::Unavailable)
    }
}

#[cfg(all(test, any(target_os = "windows", target_os = "macos")))]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{OsSecureStore, SecureStore, SecureStoreError};

    static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct FixtureCredential {
        secret_ref: String,
    }

    impl FixtureCredential {
        fn new() -> Result<Self, SecureStoreError> {
            Ok(Self {
                secret_ref: fixture_ref()?,
            })
        }
    }

    impl Drop for FixtureCredential {
        fn drop(&mut self) {
            let _cleanup = OsSecureStore.delete(&self.secret_ref);
        }
    }

    fn fixture_ref() -> Result<String, SecureStoreError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| SecureStoreError::Internal)?
            .as_nanos();
        let sequence = FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        Ok(format!(
            "M2-TU-01-{}-{timestamp}-{sequence}",
            std::process::id()
        ))
    }

    #[test]
    fn real_os_store_supports_set_get_rotate_delete() -> Result<(), SecureStoreError> {
        let store = OsSecureStore;
        let fixture = FixtureCredential::new()?;
        let secret_ref = &fixture.secret_ref;
        let first = b"M2-TU-01-test-secret-first";
        let rotated = b"M2-TU-01-test-secret-rotated";

        store.ensure_available()?;
        let _cleanup_before = store.delete(secret_ref);
        store.set(secret_ref, first)?;
        assert_eq!(store.get(secret_ref)?, first);
        store.set(secret_ref, rotated)?;
        assert_eq!(store.get(secret_ref)?, rotated);
        store.delete(secret_ref)?;
        assert_eq!(store.get(secret_ref), Err(SecureStoreError::NotFound));

        Ok(())
    }

    #[test]
    fn real_os_store_isolates_distinct_references() -> Result<(), SecureStoreError> {
        let store = OsSecureStore;
        let first_fixture = FixtureCredential::new()?;
        let second_fixture = FixtureCredential::new()?;
        let first_ref = &first_fixture.secret_ref;
        let second_ref = &second_fixture.secret_ref;
        let first = b"M2-TU-01-isolated-first";
        let second = b"M2-TU-01-isolated-second";

        let _first_cleanup_before = store.delete(first_ref);
        let _second_cleanup_before = store.delete(second_ref);
        store.set(first_ref, first)?;
        store.set(second_ref, second)?;
        assert_eq!(store.get(first_ref)?, first);
        assert_eq!(store.get(second_ref)?, second);
        store.delete(first_ref)?;
        assert_eq!(store.get(second_ref)?, second);
        store.delete(second_ref)?;

        Ok(())
    }
}
