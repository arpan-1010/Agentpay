"use client";

import type { Address } from "viem";
import { useAgentState } from "@/components/agent-state";
import { OwnerGate, TxStatus, useOwnerTx } from "@/components/owner-wallet";
import { Button } from "@/components/ui/button";

export function RestoreAccess({
  wallet,
  agentAddress,
}: {
  wallet: Address;
  agentAddress: Address;
}) {
  const { status } = useAgentState();
  const tx = useOwnerTx();

  if (status !== "revoked" && status !== "expired") return null;

  const expired = status === "expired";
  const busy = tx.phase === "signing" || tx.phase === "confirming";
  const verb = expired ? "Renew" : "Restore";

  return (
    <section
      aria-labelledby="restore-heading"
      className="rounded-xl border border-border p-5"
    >
      <h2 id="restore-heading" className="font-display text-xl tracking-tight">
        {verb} access
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {expired
          ? "The agent's key ran out. This registers it again for 7 days."
          : "Registers the agent's key again for 7 days."}{" "}
        Spending limits and the recipient allowlist stay as they were.
      </p>
      <OwnerGate wallet={wallet}>
        <div className="mt-4">
          <Button
            disabled={busy}
            onClick={() => tx.restore(wallet, agentAddress)}
          >
            {verb} access for 7 days
          </Button>
        </div>
        <TxStatus tx={tx} />
      </OwnerGate>
    </section>
  );
}