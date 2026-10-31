use anyhow::{Result, bail};
use std::path::Path;

fn flag_path() -> String {
    std::env::var("KILL_SWITCH_FILE").unwrap_or_else(|_| "KILL".into())
}

pub fn is_active() -> bool {
    Path::new(&flag_path()).exists()
}

pub fn ensure_running() -> Result<()> {
    if is_active() {
        bail!("kill switch is active: the agent is paused and cannot act");
    }
    Ok(())
}

pub fn pause() -> Result<()> {
    std::fs::write(flag_path(), "paused from the dashboard")?;
    Ok(())
}

pub fn resume() -> Result<()> {
    match std::fs::remove_file(flag_path()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}