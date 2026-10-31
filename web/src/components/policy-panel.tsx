import type { ReactNode } from "react";
import { explorerAddress, formatExpiry, shortAddress } from "@/lib/format";
import type { Policy } from "@/lib/types";

export function PolicyPanel({ policy }: { policy: Policy }) {
  const rows: [string, ReactNode][] = [
    ["Wallet balance", `${policy.walletUsdc.toFixed(2)} USDC`],
    ["Agent gas", `${policy.agentGasEth} ETH`],
    ["Max per payment", `${policy.maxPerTx.toFixed(2)} USDC`],
    ["Max per day", `${policy.maxPerDay.toFixed(2)} USDC`],
    ["Agent key expires in", formatExpiry(policy.agentExpiresInHours)],
    [
      "Wallet",
      <a
        key="wallet"
        href={explorerAddress(policy.wallet)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm underline-offset-4 hover:underline"
      >
        {shortAddress(policy.wallet)}
      </a>,
    ],
  ];

  return (
    <section aria-labelledby="policy-heading">
      <h2 id="policy-heading" className="font-display text-2xl tracking-tight">
        Wallet and limits
      </h2>
      <dl className="mt-6 divide-y divide-border border-y border-border">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        The wallet contract enforces these limits. The agent cannot change them.
      </p>
    </section>
  );
}