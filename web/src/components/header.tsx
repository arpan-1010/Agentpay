"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAgentState } from "@/components/agent-state";
import { formatExpiry } from "@/lib/format";

export function Header({ expiresInHours }: { expiresInHours: number }) {
  const { status, busy, togglePause } = useAgentState();

  const message =
    status === "active"
      ? `Agent active. Key expires in ${formatExpiry(expiresInHours)}.`
      : status === "paused"
        ? "Agent paused. Nothing can be spent until you resume it."
        : status === "expired"
          ? "Agent key expired. It cannot spend until you renew it."
          : "Access revoked. The agent can no longer spend.";

  const dot =
    status === "active"
      ? "bg-live"
      : status === "paused"
        ? "bg-muted-foreground"
        : "bg-signal";

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-8">
	
	<Image src="/logo-v2.png" alt="AgentPay" width={692} height={172} priority className="h-8 w-auto"/>	

        <Button
          variant="outline"
          disabled={status === "revoked" || status === "expired" || busy}
          onClick={togglePause}
          className="sm:order-last"
        >
          {status === "paused" ? "Resume agent" : "Pause agent"}
        </Button>

        <p
          aria-live="polite"
          className="order-last flex w-full items-center gap-2 text-sm text-muted-foreground sm:order-none sm:w-auto"
        >
          <span className="relative flex size-2">
            {status === "active" && (
              <span className="absolute inline-flex size-full rounded-full bg-live opacity-60 motion-safe:animate-ping" />
            )}
            <span
              className={`relative inline-flex size-2 rounded-full ${dot}`}
            />
          </span>
          {message}
        </p>
      </div>
    </header>
  );
}
