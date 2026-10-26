use alloy::{
    network::EthereumWallet,
    primitives::{
        utils::{format_ether, format_units, parse_units},
        Address, TxHash, U256,
    },
    providers::{DynProvider, Provider, ProviderBuilder},
    signers::local::PrivateKeySigner,
    sol,
};
use anyhow::{bail, Context, Result};

sol! {
    #[sol(rpc)]
    interface IERC20 {
        function balanceOf(address account) external view returns (uint256);
    }

    #[sol(rpc)]
    interface IAgentWallet {
        error NotAgent();
        error ZeroAddress();
        function agent() external view returns (address);
        function transferUSDC(address to, uint256 amount) external;
    }
}

const USDC_DECIMALS: u8 = 6;

pub struct WalletClient {
    provider: DynProvider,
    pub agent_address: Address,
    pub wallet_address: Address,
    usdc: Address,
}

impl WalletClient {
    pub async fn from_env() -> Result<Self> {
        let rpc = std::env::var("BASE_SEPOLIA_RPC_URL")
            .unwrap_or_else(|_| "https://sepolia.base.org".to_string());

        let signer: PrivateKeySigner = std::env::var("AGENT_PRIVATE_KEY")
            .context("AGENT_PRIVATE_KEY is not set")?
            .parse()
            .context("AGENT_PRIVATE_KEY is not a valid private key")?;
        let agent_address = signer.address();

        let wallet_address: Address = std::env::var("AGENT_WALLET_ADDRESS")
            .context("AGENT_WALLET_ADDRESS is not set")?
            .parse()
            .context("AGENT_WALLET_ADDRESS is invalid")?;
        let usdc: Address = std::env::var("USDC_ADDRESS")
            .context("USDC_ADDRESS is not set")?
            .parse()
            .context("USDC_ADDRESS is invalid")?;

        let provider = ProviderBuilder::new()
            .wallet(EthereumWallet::from(signer))
            .connect_http(rpc.parse()?)
            .erased();

        let registered = IAgentWallet::new(wallet_address, provider.clone())
            .agent()
            .call()
            .await
            .context("could not read agent() from the wallet contract")?;
        if registered != agent_address {
            bail!(
                "signer {agent_address} is not the registered agent ({registered}); \
                 was the agent revoked or replaced?"
            );
        }

        Ok(Self { provider, agent_address, wallet_address, usdc })
    }

    pub async fn usdc_balance(&self) -> Result<String> {
        let raw = IERC20::new(self.usdc, self.provider.clone())
            .balanceOf(self.wallet_address)
            .call()
            .await?;
        Ok(format_units(raw, USDC_DECIMALS)?)
    }

    pub async fn agent_gas_balance(&self) -> Result<String> {
        let raw = self.provider.get_balance(self.agent_address).await?;
        Ok(format_ether(raw))
    }

    pub async fn transfer_usdc(&self, to: Address, amount: &str) -> Result<TxHash> {
        let amount: U256 = parse_units(amount, USDC_DECIMALS)
            .context("amount is not a valid number")?
            .into();
        if amount.is_zero() {
            bail!("amount must be greater than zero");
        }

        let contract = IAgentWallet::new(self.wallet_address, self.provider.clone());
        let call = contract.transferUSDC(to, amount);

        call.call()
            .await
            .context("simulation failed, nothing was sent")?;
        println!("simulation ok");

        let receipt = call.send().await?.get_receipt().await?;
        if !receipt.status() {
            bail!("transaction {} reverted on-chain", receipt.transaction_hash);
        }
        Ok(receipt.transaction_hash)
    }
}