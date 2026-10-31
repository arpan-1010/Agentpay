"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useApprovals, useDecide } from "@/lib/queries";
import type { Approval } from "@/lib/types";

const EASE = [0.16, 1, 0.3, 1] as const;

function windowText(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`;
  const m = Math.round(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

export function ApprovalBanner() {
  const approvals = useApprovals();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {(approvals.data ?? []).map((a) => (
        <motion.div
          key={a.id}
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="overflow-hidden"
        >
          <ApprovalCard approval={a} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

function ApprovalCard({ approval: a }: { approval: Approval }) {
  const decide = useDecide();
  const reduce = useReducedMotion();
  const [startSeconds] = useState(a.secondsLeft);
  const busy = decide.isPending;

  return (
    <section
      role="alert"
      aria-label="Payment waiting for your approval"
      className="mb-10 overflow-hidden rounded-xl border border-foreground bg-card"
    >
      <div className="p-5 sm:p-6">
        <h2 className="font-display text-2xl tracking-tight">
          The agent wants to pay{" "}
          <span className="tabular-nums">{a.amount.toFixed(2)} USDC</span>
        </h2>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">To</dt>
          <dd className="break-all font-mono">{a.to}</dd>
          <dt className="text-muted-foreground">For</dt>
          <dd>{a.what}</dd>
          <dt className="text-muted-foreground">Agent&apos;s reason</dt>
          <dd>{a.reason}</dd>
        </dl>

        {!a.onAllowlist && (
          <p className="mt-4 text-sm font-medium">
            This address is not on your allowlist. The wallet will refuse this
            payment even if you approve it.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={busy}
            onClick={() => decide.mutate({ id: a.id, action: "approve" })}
          >
            {a.onAllowlist ? "Approve payment" : "Approve anyway"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => decide.mutate({ id: a.id, action: "decline" })}
          >
            Decline
          </Button>
          <p className="text-sm text-muted-foreground">
            Declined automatically if nobody answers within{" "}
            {windowText(a.totalSeconds)}.
          </p>
        </div>

        {decide.isError && (
          <p className="mt-3 text-sm font-medium">
            Couldn&apos;t send your answer. The request may have expired.
          </p>
        )}
      </div>

      {!reduce && (
        <motion.div
          aria-hidden
          className="h-1 origin-left bg-spend"
          initial={{ scaleX: startSeconds / a.totalSeconds }}
          animate={{ scaleX: 0 }}
          transition={{ duration: startSeconds, ease: "linear" }}
        />
      )}
    </section>
  );
}