use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone)]
pub struct Event {
    pub ts: u64,
    pub kind: String,
    pub amount: String,
    pub to: String,
    pub what: String,
    pub reason: String,
    pub tx: Option<String>,
    pub note: Option<String>,
}

fn path() -> String {
    std::env::var("EVENT_LOG").unwrap_or_else(|_| "events.jsonl".into())
}

pub fn record(
    kind: &str,
    amount: &str,
    to: &str,
    what: &str,
    reason: &str,
    tx: Option<&str>,
    note: Option<&str>,
) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let ev = Event {
        ts,
        kind: kind.into(),
        amount: amount.into(),
        to: to.into(),
        what: what.into(),
        reason: reason
            .chars()
            .filter(|c| !c.is_control())
            .take(200)
            .collect(),
        tx: tx.map(String::from),
        note: note.map(String::from),
    };
    if let Err(e) = append(&ev) {
        println!("[warn] could not write event log: {e:#}");
    }
}

fn append(ev: &Event) -> Result<()> {
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path())?;
    writeln!(f, "{}", serde_json::to_string(ev)?)?;
    Ok(())
}

pub fn read_all() -> Vec<Event> {
    let Ok(text) = std::fs::read_to_string(path()) else {
        return Vec::new();
    };
    let mut events: Vec<Event> = text
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    events.reverse();
    events.truncate(200);
    events
}

pub fn blocked_note(e: &anyhow::Error) -> String {
    let s = format!("{e:#}");
    s.strip_prefix("simulation failed, nothing was sent: ")
        .unwrap_or(&s)
        .to_string()
}

pub fn declined_note(e: &anyhow::Error) -> &'static str {
    if format!("{e}").contains("timed out") {
        "Nobody answered in time, so it was declined"
    } else {
        "You declined this payment"
    }
}