use alloy::primitives::{utils::parse_units, Address, U256};
use anyhow::{bail, Context, Result};
use serde_json::{json, Value};
use std::io::Write;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::wallet::{usdc_str, WalletClient};

pub struct PaidApi {
    http: reqwest::Client,
    base_url: String,
    budget_limit: U256,
    spent: Mutex<U256>,
    log_path: String,
}

impl PaidApi {
    pub fn from_env() -> Result<Self> {
        let budget = std::env::var("TASK_BUDGET_USDC").unwrap_or_else(|_| "0.50".into());
        let budget_limit: U256 = parse_units(&budget, 6u8)
            .context("TASK_BUDGET_USDC is not a valid number")?
            .into();
        Ok(Self {
            http: reqwest::Client::builder().timeout(Duration::from_secs(20)).build()?,
            base_url: std::env::var("PAID_API_URL").unwrap_or_else(|_| "http://localhost:4020".into()),
            budget_limit,
            spent: Mutex::new(U256::ZERO),
            log_path: std::env::var("PAYMENT_LOG").unwrap_or_else(|_| "payments.jsonl".into()),
        })
    }

    fn remaining(&self) -> U256 {
        self.budget_limit.saturating_sub(*self.spent.lock().unwrap())
    }

    /// The model passes a path, never a full URL, so an injected instruction
    /// can't point the agent at some other server.
    fn url(&self, path: &str) -> Result<String> {
        if !path.starts_with("/api/") || path.contains("..") || path.contains("://") {
            bail!("path must look like /api/..., taken from list_paid_apis");
        }
        Ok(format!("{}{}", self.base_url.trim_end_matches('/'), path))
    }

        pub async fn catalog(&self) -> Result<Value> {
        let url = format!("{}/catalog", self.base_url.trim_end_matches('/'));
        let raw: Value = self.http.get(url).send().await?.error_for_status()?.json().await?;
        let mut v = clean_catalog(&raw);
        v["budget_remaining_usdc"] = json!(usdc_str(self.remaining()));
        Ok(v)
    }

    pub async fn pay_and_fetch(&self, wallet: &WalletClient, path: &str, reason: &str) -> Result<Value> {
        let url = self.url(path)?;

         let listed = self.catalog().await?;
        if !listed["apis"].as_array().is_some_and(|a| a.iter().any(|x| x["path"] == path)) {
            bail!("path is not in the catalog; use list_paid_apis and pick a listed path");
        }

        // 1. Ask without paying.
        let first = self.http.get(&url).send().await.context("could not reach the paid API")?;
        if first.status() != reqwest::StatusCode::PAYMENT_REQUIRED {
            return Ok(json!({ "paid": false, "status": first.status().as_u16() }));
        }

        // 2. Read and sanity-check the payment terms.
        let terms: Value = first.json().await.context("402 body was not JSON")?;
        let accept = terms["accepts"].get(0).context("402 response had no payment options")?;
        let pay_to: Address = accept["payTo"].as_str().context("missing payTo")?
            .parse().context("payTo is not an address")?;
        let asset: Address = accept["asset"].as_str().context("missing asset")?
            .parse().context("asset is not an address")?;
        let price: U256 = accept["maxAmountRequired"].as_str().context("missing price")?
            .parse().context("price is not a number")?;
        if accept["network"] != "base-sepolia" {
            bail!("API asked for a network other than base-sepolia; nothing was paid");
        }
        if asset != wallet.usdc {
            bail!("API asked for a different token than the wallet's USDC; nothing was paid");
        }

        // 3. Budget check happens BEFORE any money moves.
        let remaining = self.remaining();
        if price > remaining {
            bail!(
                "price {} USDC exceeds the remaining task budget of {} USDC; nothing was paid",
                usdc_str(price), usdc_str(remaining)
            );
        }
        
        crate::approval::confirm(pay_to, price, reason).await?;

        // 4. Pay through the wallet contract (simulate, then send; the chain enforces its own limits too).
        let tx = wallet.transfer_usdc(pay_to, &usdc_str(price)).await?;
        *self.spent.lock().unwrap() += price; // tool calls run one at a time, so check-then-commit is safe
        if let Err(e) = self.log(path, pay_to, price, &tx.to_string(), reason) {
            println!("[warn] could not write payment log: {e:#}");
        }

        // 5. Retry with proof. The API's node may lag a moment, so allow a few 402s.
        let proof = json!({ "scheme": "exact-tx", "network": "base-sepolia", "txHash": tx.to_string() }).to_string();
        let mut last = String::new();
        for _ in 0..5 {
            let r = self.http.get(&url).header("X-PAYMENT", &proof).send().await?;
            let status = r.status();
                        if status.is_success() {
                let bytes = r.bytes().await?;
                if bytes.len() > MAX_BODY_BYTES {
                    bail!("payment sent (tx {tx}) but the API response was too large; ignored");
                }
                let data: Value = serde_json::from_slice(&bytes)
                    .context("API response was not valid JSON")?;
                return Ok(json!({
                    "paid": true,
                    "amount_usdc": usdc_str(price),
                    "tx_hash": tx.to_string(),
                    "budget_remaining_usdc": usdc_str(self.remaining()),
                    "data": sanitize_data(&data),
                }));
            }
            last = r.text().await.unwrap_or_default();
            if status != reqwest::StatusCode::PAYMENT_REQUIRED {
                break;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        bail!("payment was sent (tx {tx}) but the API did not accept it: {last}")
    }

    fn log(&self, path: &str, pay_to: Address, amount: U256, tx: &str, reason: &str) -> Result<()> {
        let line = json!({
            "ts": SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
            "path": path,
            "pay_to": pay_to.to_string(),
            "amount_usdc": usdc_str(amount),
            "tx_hash": tx,
            "reason": reason,
        });
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open(&self.log_path)?;
        writeln!(f, "{line}")?;
        Ok(())
    }
}

const MAX_BODY_BYTES: usize = 16 * 1024;
const ALLOWED_FIELDS: [&str; 3] = ["usd", "change_24h_pct", "volume_24h_usd"];

/// Keep only known fields whose values are plain numbers. Free text never reaches the model.
/// We report only a COUNT of dropped fields: their names are attacker-controlled text too.
fn sanitize_data(raw: &Value) -> Value {
    let mut fields = serde_json::Map::new();
    let mut dropped = 0;
    if let Some(obj) = raw.as_object() {
        for (k, v) in obj {
            if ALLOWED_FIELDS.contains(&k.as_str()) && v.is_number() {
                fields.insert(k.clone(), v.clone());
            } else {
                dropped += 1;
            }
        }
    }
    json!({
        "untrusted_api_data": fields,
        "dropped_field_count": dropped,
    })
}

/// The catalog is also API-controlled text. Rebuild it from validated pieces only,
/// and drop the free-text `description` entirely.
fn clean_catalog(raw: &Value) -> Value {
    let ident = |s: &str| {
        !s.is_empty() && s.len() <= 32
            && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    };
    let mut apis = Vec::new();
    for a in raw["apis"].as_array().into_iter().flatten().take(20) {
        let path = a["path"].as_str().unwrap_or("");
        let price = a["price_usdc"].as_str().unwrap_or("");
        let path_ok = path.starts_with("/api/") && path.len() <= 64
            && path.chars().all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '-' || c == '_');
        let price_ok = !price.is_empty() && price.len() <= 12
            && price.chars().all(|c| c.is_ascii_digit() || c == '.');
        if !path_ok || !price_ok {
            continue;
        }
        let returns: Vec<&str> = a["returns"].as_array().into_iter().flatten()
            .filter_map(|r| r.as_str()).filter(|r| ident(r)).take(10).collect();
        apis.push(json!({ "path": path, "price_usdc": price, "returns": returns }));
    }
    json!({ "apis": apis })
}