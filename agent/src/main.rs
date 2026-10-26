use alloy::primitives::Address;
use wallet::WalletClient;

mod agent;
mod llm;
mod tools;
mod wallet;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let client = WalletClient::from_env().await?;

    match args.first().map(String::as_str) {
        Some("balance") => {
            println!("wallet contract: {}", client.wallet_address);
            println!("USDC balance:    {}", client.usdc_balance().await?);
            println!("agent address:   {}", client.agent_address);
            println!("agent gas (ETH): {}", client.agent_gas_balance().await?);
            let p = client.policy().await?;
            println!("per-tx limit:   {} USDC", p.max_per_tx);
            println!("daily limit:    {} USDC", p.max_per_day);
            println!("left today:     {} USDC", p.remaining_today);
            println!("agent expires:  in {} hours", p.agent_expires_in_hours);
        }
        Some("send") => {
            let (Some(to), Some(amount)) = (args.get(1), args.get(2)) else {
                anyhow::bail!("usage: send <address> <amount>");
            };
            let to: Address = to.parse()?;
            let hash = client.transfer_usdc(to, amount).await?;
            println!("sent. tx hash: {hash}");
        }
        Some("ask") => {
            let prompt = args[1..].join(" ");
            if prompt.trim().is_empty() {
                anyhow::bail!("usage: ask <what you want the agent to do>");
            }
            let answer = agent::run(&client, &prompt).await?;
            println!("\n[answer]\n{answer}");
        }
        _ => println!("usage:\n  balance\n  send <address> <amount> ask <prompt>"),
    }

    Ok(())
}