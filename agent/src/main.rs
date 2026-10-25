use alloy::primitives::{utils::format_ether, Address};
use alloy::providers::{Provider, ProviderBuilder};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env (searches the current folder and parent folders)
    dotenvy::dotenv().ok();

    // Connect to Base Sepolia over plain HTTP RPC
    let rpc_url = std::env::var("BASE_SEPOLIA_RPC_URL")
        .unwrap_or_else(|_| "https://sepolia.base.org".to_string());
    let provider = ProviderBuilder::new().connect_http(rpc_url.parse()?);

    // Ask the node which chain we are on. Base Sepolia should say 84532.
    let chain_id = provider.get_chain_id().await?;
    println!("chain id: {chain_id}");

    // Read the owner's ETH balance
    let owner: Address = std::env::var("OWNER_ADDRESS")?.parse()?;
    let balance = provider.get_balance(owner).await?;
    println!("owner {owner} has {} ETH", format_ether(balance));

    Ok(())
}