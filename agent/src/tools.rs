use alloy::primitives::Address;
use anyhow::Context;
use serde_json::{Value, json};

use crate::wallet::WalletClient;
use crate::x402::PaidApi;

pub fn definitions() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "get_balance",
                "description": "Get the wallet's USDC balance and the agent's ETH gas balance.",
                "parameters": { "type": "object", "properties": {} }
            }
        },

        {
            "type": "function",
            "function": {
                "name": "get_policy",
                "description": "Get the wallet's spending limits: per-transaction cap, daily cap, how much can still be spent today, and when the agent key expires.",
                "parameters": { "type": "object", "properties": {} }
            }
        },

        {
            "type": "function",
            "function": {
                "name": "send_usdc",
                "description": "Send USDC from the wallet to an address. Only call this when the user explicitly asks to send money. The wallet contract enforces spending limits and an allowlist; if a payment is refused, report the reason to the user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "to": { "type": "string", "description": "Recipient 0x address, exactly as the user gave it" },
                        "amount": { "type": "string", "description": "Amount in USDC as a decimal string, e.g. \"0.5\"" },
                        "reason": { "type": "string", "description": "Short reason for this payment" }
                    },
                    "required": ["to", "amount", "reason"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_paid_apis",
                "description": "List the paid data APIs with price per call in USDC and the fields each returns. Free to call. Also shows the remaining spending budget for this task.",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "pay_for_api",
                "description": "Call one paid API by path (e.g. \"/api/price/basic\"). If it asks for payment, this pays from the wallet within the task budget and returns the data. Only use paths from list_paid_apis.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "API path from list_paid_apis" },
                        "reason": { "type": "string", "description": "Why this API was chosen over the others" }
                    },
                    "required": ["path", "reason"]
                }
            }
        }
    ])
}

pub async fn run_tool(wallet: &WalletClient, paid: &PaidApi, name: &str, args: &str) -> String {
    match dispatch(wallet, paid, name, args).await {
        Ok(v) => v.to_string(),
        Err(e) => json!({ "error": format!("{e:#}") }).to_string(),
    }
}

async fn dispatch(wallet: &WalletClient, paid: &PaidApi, name: &str, args: &str) -> anyhow::Result<Value> {
    let args: Value = serde_json::from_str(args).context("tool arguments were not valid JSON")?;

    match name {
        "get_balance" => Ok(json!({
            "usdc": wallet.usdc_balance().await?,
            "agent_gas_eth": wallet.agent_gas_balance().await?,
        })),

        "get_policy" => {
            let p = wallet.policy().await?;
            Ok(json!({
                "max_per_tx_usdc": p.max_per_tx,
                "max_per_day_usdc": p.max_per_day,
                "remaining_today_usdc": p.remaining_today,
                "agent_expires_in_hours": p.agent_expires_in_hours,
            }))
        }

        "send_usdc" => {
            let to = args["to"].as_str().context("missing 'to'")?;
            let amount = args["amount"]
                .as_str()
                .map(String::from)
                .or_else(|| args["amount"].as_f64().map(|n| n.to_string()))
                .context("missing 'amount'")?;
            let reason = args["reason"].as_str().unwrap_or("(none given)");

            let to: Address = to.parse().context("'to' is not a valid address")?;

            println!("[tool] send_usdc to={to} amount={amount} reason={reason}");
            let hash = wallet.transfer_usdc(to, &amount).await?;
            Ok(json!({ "ok": true, "tx_hash": hash.to_string() }))
        }

                "list_paid_apis" => paid.catalog().await,

        "pay_for_api" => {
            let path = args["path"].as_str().context("missing 'path'")?;
            let reason = args["reason"].as_str().unwrap_or("(none given)");
            println!("[tool] pay_for_api path={path} reason={reason}");
            paid.pay_and_fetch(wallet, path, reason).await
        }

        other => anyhow::bail!("unknown tool: {other}"),
    }
}