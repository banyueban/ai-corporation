use std::io;
use std::process::ExitCode;

const SESSION_TOKEN_ENV: &str = "AI_CORPORATION_SESSION_TOKEN";

fn main() -> ExitCode {
    let session_token = match std::env::var(SESSION_TOKEN_ENV) {
        Ok(token) if (32..=256).contains(&token.len()) => token,
        _ => {
            eprintln!("native-core could not start: session configuration is invalid");
            return ExitCode::from(2);
        }
    };

    match native_core::run(io::stdin().lock(), io::stdout().lock(), &session_token) {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => {
            eprintln!("native-core stopped after an I/O failure");
            ExitCode::from(1)
        }
    }
}
