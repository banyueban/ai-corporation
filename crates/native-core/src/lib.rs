//! Narrow native capabilities for AI Corporation Desktop.
//!
//! RPC transport and operating-system integrations are introduced in later
//! Milestone 0 tasks.

/// Identifies this crate without exposing any system capability.
pub const CRATE_NAME: &str = "native-core";

#[cfg(test)]
mod tests {
    use super::CRATE_NAME;

    #[test]
    fn crate_name_is_stable() {
        assert_eq!(CRATE_NAME, "native-core");
    }
}
