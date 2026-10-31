"use client";

import type { Address } from "viem";
import { useAgentState } from "@/components/agent-state";
import { HoldToConfirm } from "@/components/hold-to-confirm";
import { OwnerGate, TxStatus, useOwnerTx } from "@/components/owner-wallet";

export function RevokeAccess({ wallet }: { wallet: Address }) {
  const { status } = useAgentState();
  const tx = useOwnerTx();
  const canStart = tx.phase === "idle" || tx.phase === "error";

  return (
    <section
      aria-labelledby="revoke-heading"
      className="rounded-xl border border-signal/30 p-5"
    >
      <h2 id="revoke-heading" className="font-display text-xl tracking-tight">
        Revoke access
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Cuts off the agent&apos;s key on the blockchain right away. Funds stay
        in the wallet. You can restore access later by setting a new agent key.
      </p>

      {status === "revoked" || status === "expired" ? (
        <p className="mt-4 text-sm font-medium">
          {status === "revoked"
            ? "Access revoked. The agent can no longer spend."
            : "The key has already expired, so there is nothing to revoke."}
        </p>
      ) : (
        <OwnerGate wallet={wallet}>
          {canStart && (
            <div className="mt-4">
              <HoldToConfirm
                label="Hold to revoke access"
                onConfirm={() => tx.revoke(wallet)}
              />
            </div>
          )}
          <TxStatus tx={tx} />
        </OwnerGate>
      )}
    </section>
  );
}