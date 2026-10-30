use anyhow::{bail, Result};
use std::path::Path;

fn flag_path() -> String {
    std::env::var("KILL_SWITCH_FILE").unwrap_or_else(|_| "KILL".into())
}

/// Err if a human has pulled the kill switch. Cheap enough to call before every step.
pub fn ensure_running() -> Result<()> {
    if Path::new(&flag_path()).exists() {
        bail!("kill switch is active: the agent is paused and cannot act");
    }
    Ok(())
}