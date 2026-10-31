"use client";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useConnect,
  useConnection,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import { explorerTx, shortAddress } from "@/lib/format";
import { agentWalletAbi } from "@/lib/wallet-abi";

export type TxPhase = "idle" | "signing" | "confirming" | "done" | "error";

export function useOwnerTx() {
  const queryClient = useQueryClient();
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });

  const confirmed = receipt.data?.status === "success";
  const reverted = receipt.data?.status === "reverted";

  useEffect(() => {
    if (confirmed) queryClient.invalidateQueries({ queryKey: ["status"] });
  }, [confirmed, queryClient]);

  const phase: TxPhase = write.isPending
    ? "signing"
    : confirmed
      ? "done"
      : write.isError || receipt.isError || reverted
        ? "error"
        : write.data
          ? "confirming"
          : "idle";

  let error: string | null = null;
  if (reverted) {
    error = "The transaction was reverted on-chain.";
  } else if (write.isError || receipt.isError) {
    const e = (write.error ?? receipt.error) as {
      shortMessage?: string;
    } | null;
    error = e?.shortMessage ?? "The transaction failed.";
  }

  return {
    phase,
    error,
    hash: write.data,
    revoke: (wallet: Address) =>
      write.mutate({
        address: wallet,
        abi: agentWalletAbi,
        functionName: "revokeAgent",
        chainId: baseSepolia.id,
      }),
    restore: (wallet: Address, agent: Address, days = 7) =>
      write.mutate({
        address: wallet,
        abi: agentWalletAbi,
        functionName: "setAgent",
        args: [agent, BigInt(Math.floor(Date.now() / 1000) + days * 86_400)],
        chainId: baseSepolia.id,
      }),
  };
}

export function TxStatus({ tx }: { tx: ReturnType<typeof useOwnerTx> }) {
  return (
    <div aria-live="polite" className="mt-3 text-sm">
      {tx.phase === "signing" && <p>Confirm the transaction in your wallet…</p>}
      {tx.phase === "confirming" && (
        <p>
          Waiting for the blockchain to confirm…{" "}
          {tx.hash && (
            <a
              href={explorerTx(tx.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-spend underline-offset-4 hover:underline"
            >
              View transaction
            </a>
          )}
        </p>
      )}
      {tx.phase === "error" && <p className="font-medium">{tx.error}</p>}
    </div>
  );
}

export function OwnerGate({
  wallet,
  children,
}: {
  wallet: Address;
  children: ReactNode;
}) {
  const { address, status, chainId } = useConnection();
  const owner = useReadContract({
    address: wallet,
    abi: agentWalletAbi,
    functionName: "owner",
    chainId: baseSepolia.id,
  });
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const { mutate: disconnect } = useDisconnect();

  if (status === "connecting" || status === "reconnecting") {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Checking your wallet…
      </p>
    );
  }

  if (status !== "connected" || !address) {
    return (
      <div className="mt-4 space-y-2">
        <Button
          variant="outline"
          disabled={connect.isPending}
          onClick={() => connect.mutate({ connector: connect.connectors[0] })}
        >
          {connect.isPending ? "Check your wallet…" : "Connect owner wallet"}
        </Button>
        {connect.isError && (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t connect. Check that a browser wallet such as MetaMask
            is installed and unlocked.
          </p>
        )}
      </div>
    );
  }

  if (chainId !== baseSepolia.id) {
    return (
      <div className="mt-4">
        <Button
          variant="outline"
          disabled={switchChain.isPending}
          onClick={() => switchChain.mutate({ chainId: baseSepolia.id })}
        >
          Switch to Base Sepolia
        </Button>
      </div>
    );
  }

  if (owner.isLoading) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Checking who owns the wallet…
      </p>
    );
  }
  if (owner.isError || !owner.data) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Couldn&apos;t read the wallet&apos;s owner from the blockchain. Try
        reloading.
      </p>
    );
  }

  if (owner.data.toLowerCase() !== address.toLowerCase()) {
    return (
      <div className="mt-4 space-y-2 text-sm">
        <p>
          The connected account ({shortAddress(address)}) is not this
          wallet&apos;s owner. Switch to {shortAddress(owner.data)} in your
          wallet.
        </p>
        <Button variant="ghost" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-muted-foreground">
        Owner connected:{" "}
        <span className="font-mono">{shortAddress(address)}</span>
      </p>
      {children}
    </>
  );
}