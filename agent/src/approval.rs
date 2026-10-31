use alloy::primitives::{Address, U256, utils::parse_units};
use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use std::io::{self, Write};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::wallet::usdc_str;

#[derive(Serialize, Deserialize, Clone)]
pub struct Request {
    pub id: String,
    pub ts: u64,
    pub expires_at: u64,
    pub amount: String,
    pub to: String,
    pub what: String,
    pub reason: String,
    pub decision: Option<String>,
}

fn threshold() -> Result<U256> {
    let s = std::env::var("APPROVAL_THRESHOLD_USDC").unwrap_or_else(|_| "0.02".into());
    Ok(parse_units(&s, 6u8)
        .context("APPROVAL_THRESHOLD_USDC is not a valid number")?
        .into())
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn dir() -> PathBuf {
    PathBuf::from(std::env::var("APPROVAL_DIR").unwrap_or_else(|_| "approvals".into()))
}

fn file(id: &str) -> PathBuf {
    dir().join(format!("{id}.json"))
}

pub fn valid_id(id: &str) -> bool {
    (8..=40).contains(&id.len()) && id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

fn write(req: &Request) -> Result<()> {
    std::fs::create_dir_all(dir())?;
    let tmp = dir().join(format!("{}.tmp", req.id));
    std::fs::write(&tmp, serde_json::to_vec(req)?)?;
    std::fs::rename(&tmp, file(&req.id))?;
    Ok(())
}

fn read(id: &str) -> Option<Request> {
    serde_json::from_str(&std::fs::read_to_string(file(id)).ok()?).ok()
}

pub fn pending() -> Vec<Request> {
    let Ok(entries) = std::fs::read_dir(dir()) else {
        return Vec::new();
    };
    let now = now();
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(req) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str::<Request>(&t).ok())
        else {
            continue;
        };
        if req.expires_at + 60 < now {
            let _ = std::fs::remove_file(&path);
            continue;
        }
        if req.decision.is_none() && req.expires_at > now {
            out.push(req);
        }
    }
    out.sort_by_key(|r| r.ts);
    out
}

pub fn decide(id: &str, approve: bool) -> Result<()> {
    if !valid_id(id) {
        bail!("invalid request id");
    }
    let mut req = read(id).context("no such approval request (it may have expired)")?;
    if req.decision.is_some() {
        bail!("this request was already answered");
    }
    if req.expires_at <= now() {
        bail!("this request has expired");
    }
    req.decision = Some(if approve { "approved" } else { "declined" }.into());
    write(&req)
}

pub async fn confirm(to: Address, amount: U256, what: &str, reason: &str) -> Result<()> {
    if amount <= threshold()? {
        return Ok(());
    }

    let reason: String = reason
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect();
    let what: String = what.chars().filter(|c| !c.is_control()).take(60).collect();

    match std::env::var("APPROVAL_MODE").as_deref() {
        Ok("terminal") => confirm_terminal(to, amount, &reason).await,
        _ => confirm_dashboard(to, amount, &what, &reason).await,
    }
}

async fn confirm_dashboard(to: Address, amount: U256, what: &str, reason: &str) -> Result<()> {
    let timeout: u64 = std::env::var("APPROVAL_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(120);

    let ts = now();
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let id = format!("{:x}{:x}", nanos, std::process::id());

    let req = Request {
        id: id.clone(),
        ts,
        expires_at: ts + timeout,
        amount: usdc_str(amount),
        to: to.to_string(),
        what: what.into(),
        reason: reason.into(),
        decision: None,
    };
    write(&req)?;
    println!(
        "[approval] {} USDC to {to}: waiting for your answer in the dashboard ({timeout}s)",
        req.amount
    );

    let outcome = loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        match read(&id) {
            None => {
                break Err(anyhow!(
                    "the approval request disappeared, so the payment was declined; nothing was sent"
                ));
            }
            Some(r) => match r.decision.as_deref() {
                Some("approved") => break Ok(()),
                Some(_) => {
                    break Err(anyhow!(
                        "the human owner declined this payment; nothing was sent"
                    ));
                }
                None => {}
            },
        }
        if now() >= ts + timeout {
            break Err(anyhow!(
                "approval timed out: nobody answered within {timeout}s, so the payment was declined; nothing was sent"
            ));
        }
    };

    let _ = std::fs::remove_file(file(&id));
    outcome
}

async fn confirm_terminal(to: Address, amount: U256, reason: &str) -> Result<()> {
    let reason = reason.to_string();
    let amount_str = usdc_str(amount);

    let answer = tokio::task::spawn_blocking(move || -> io::Result<String> {
        println!("\n=== APPROVAL REQUIRED ===");
        println!("amount:  {amount_str} USDC");
        println!("payee:   {to}");
        println!("agent says: {reason}");
        print!("Approve? [y/N] ");
        io::stdout().flush()?;

        let mut line = String::new();
        io::stdin().read_line(&mut line)?;
        Ok(line)
    })
    .await
    .context("approval prompt crashed")??;

    if matches!(answer.trim().to_lowercase().as_str(), "y" | "yes") {
        Ok(())
    } else {
        bail!("the human owner declined this payment; nothing was sent")
    }
}