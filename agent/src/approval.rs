use alloy::primitives::{utils::parse_units, Address, U256};
use anyhow::{bail, Context, Result};
use std::io::{self, Write};

use crate::wallet::usdc_str;

fn threshold() -> Result<U256> {
    let s = std::env::var("APPROVAL_THRESHOLD_USDC").unwrap_or_else(|_| "0.02".into());
    Ok(parse_units(&s, 6u8)
        .context("APPROVAL_THRESHOLD_USDC is not a valid number")?
        .into())
}

pub async fn confirm(to: Address, amount: U256, reason: &str) -> Result<()> {
    if amount <= threshold()? {
        return Ok(());
    }

    let reason: String = reason.chars().filter(|c| !c.is_control()).take(120).collect();
    let amount_str = usdc_str(amount);

    let answer = tokio::task::spawn_blocking(move || -> io::Result<String> {
        println!("\n=== APPROVAL REQUIRED ===");
        println!("amount:  {amount_str} USDC");
        println!("payee:   {to}");
        println!("agent says: {reason}");
        print!("Approve? [Yes(y)/No(n)] ");
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