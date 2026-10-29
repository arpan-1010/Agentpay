use alloy::{
    network::EthereumWallet,
    primitives::{
        Address, TxHash, U256,
        utils::{format_ether, format_units, parse_units},
    },
    providers::{DynProvider, Provider, ProviderBuilder},
    signers::local::PrivateKeySigner,
    sol,
};
use anyhow::{Context, Result, bail};
use std::time::{SystemTime, UNIX_EPOCH};

sol! {
    #[sol(rpc)]
    interface IERC20 {
        function balanceOf(address account) external view returns (uint256);
    }

        #[sol(rpc)]
    interface IAgentWallet {
        error NotAgent();
        error AgentExpired();
        error ZeroAddress();
        error ZeroAmount();
        error RecipientNotAllowed(address to);
        error ExceedsPerTxLimit(uint256 amount, uint256 limit);
        error ExceedsDailyLimit(uint256 amount, uint256 remaining);

        function agent() external view returns (address);
        function agentExpiry() external view returns (uint64);
        function maxPerTx() external view returns (uint256);
        function maxPerDay() external view returns (uint256);
        function remainingToday() external view returns (uint256);
        function isAllowedRecipient(address) external view returns (bool);
        function transferUSDC(address to, uint256 amount) external;
    }
}

const USDC_DECIMALS: u8 = 6;

pub struct WalletClient {
    provider: DynProvider,
    pub agent_address: Address,
    pub wallet_address: Address,
    pub usdc: Address,
}

pub struct Policy {
    pub max_per_tx: String,
    pub max_per_day: String,
    pub remaining_today: String,
    pub agent_expires_in_hours: i64,
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

        Ok(Self {
            provider,
            agent_address,
            wallet_address,
            usdc,
        })
    }

    pub async fn usdc_balance(&self) -> Result<String> {
        let raw = IERC20::new(self.usdc, self.provider.clone())
            .balanceOf(self.wallet_address)
            .call()
            .await?;
        Ok(format_units(raw, USDC_DECIMALS)?)
    }

    pub async fn policy(&self) -> Result<Policy> {
        let c = IAgentWallet::new(self.wallet_address, self.provider.clone());

        let expiry = c.agentExpiry().call().await.context(
            "agentExpiry() reverted: AGENT_WALLET_ADDRESS is probably the old wallet without the spending policy",
        )?;
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

        Ok(Policy {
            max_per_tx: usdc_str(c.maxPerTx().call().await?),
            max_per_day: usdc_str(c.maxPerDay().call().await?),
            remaining_today: usdc_str(c.remainingToday().call().await?),
            agent_expires_in_hours: (expiry as i64 - now as i64) / 3600,
        })
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
        let call = contract.transferUSDC(to, amount).from(self.agent_address);

        if let Err(e) = call.call().await {
            bail!(
                "simulation failed, nothing was sent: {}",
                explain_revert(&e)
            );
        }
        println!("simulation ok");

        let receipt = call.send().await?.get_receipt().await?;
        if !receipt.status() {
            bail!("transaction {} reverted on-chain", receipt.transaction_hash);
        }
        Ok(receipt.transaction_hash)
    }
}

pub fn usdc_str(v: U256) -> String {
    format_units(v, USDC_DECIMALS).unwrap_or_else(|_| v.to_string())
}

fn explain_revert(e: &alloy::contract::Error) -> String {
    use IAgentWallet::IAgentWalletErrors as E;

    match e.as_decoded_interface_error::<E>() {
        Some(E::NotAgent(_)) => "the signer is not the registered agent".into(),
        Some(E::AgentExpired(_)) => "the agent key has expired; the owner must renew it".into(),
        Some(E::ZeroAmount(_)) => "the amount must be greater than zero".into(),
        Some(E::ZeroAddress(_)) => "the recipient cannot be the zero address".into(),
        Some(E::RecipientNotAllowed(x)) => {
            format!("recipient {} is not on the owner's allowlist", x.to)
        }
        Some(E::ExceedsPerTxLimit(x)) => format!(
            "{} USDC exceeds the per-transaction limit of {} USDC",
            usdc_str(x.amount),
            usdc_str(x.limit)
        ),
        Some(E::ExceedsDailyLimit(x)) => format!(
            "{} USDC exceeds what is left of today's limit ({} USDC remaining)",
            usdc_str(x.amount),
            usdc_str(x.remaining)
        ),
        None => format!("{e}"),
    }
}