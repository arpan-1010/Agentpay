#!/usr/bin/env bash
# Pause the agent immediately, then revoke its key on-chain.
set -euo pipefail

: "${AGENT_WALLET_ADDRESS:?set AGENT_WALLET_ADDRESS}"
: "${OWNER_PRIVATE_KEY:?set OWNER_PRIVATE_KEY}"
RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
FLAG="${KILL_SWITCH_FILE:-KILL}"

# 1. Instant off-chain pause (no gas, no waiting for a block)
date -u +%FT%TZ > "$FLAG"
echo "paused: created $FLAG"

# 2. Permanent on-chain revoke (agent = address(0), so no signer can spend)
cast send "$AGENT_WALLET_ADDRESS" "revokeAgent()" \
  --private-key "$OWNER_PRIVATE_KEY" --rpc-url "$RPC"
echo "agent key revoked on-chain"