"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Download, ExternalLink, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { explorerTx, shortAddress } from "@/lib/format";
import type { AgentEvent } from "@/lib/types";

const filters = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "stopped", label: "Stopped" },
] as const;
type Filter = (typeof filters)[number]["id"];

const status = {
  paid: { label: "Paid", Icon: Check, tone: "text-spend" },
  declined: {
    label: "Declined by you",
    Icon: X,
    tone: "text-muted-foreground",
  },
  blocked: {
    label: "Blocked by the wallet",
    Icon: ShieldAlert,
    tone: "text-foreground",
  },
} as const;

export function Activity({ events }: { events: AgentEvent[] }) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");

  const shown = events.filter((e) =>
    filter === "all"
      ? true
      : filter === "paid"
        ? e.kind === "paid"
        : e.kind !== "paid",
  );

  return (
    <section aria-labelledby="activity-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="activity-heading"
            className="font-display text-2xl tracking-tight"
          >
            Activity
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every decision the agent makes is logged here, including payments
            that did not go through.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={events.length === 0}
          onClick={() => downloadCsv(events)}
        >
          <Download aria-hidden /> Export CSV
        </Button>
      </div>

      <div
        role="group"
        aria-label="Filter activity"
        className="mt-6 flex gap-6 border-b border-border"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`relative pb-3 text-sm transition-colors ${
              filter === f.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            {filter === f.id && (
              <motion.span
                layoutId="activity-filter"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 40 }
                }
              />
            )}
          </button>
        ))}
      </div>

      <ol className="divide-y divide-border">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((e) => {
            const s = status[e.kind];
            return (
              <motion.li
                key={e.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-[auto_1fr_auto] gap-x-4 py-5"
              >
                <span className={`mt-0.5 ${s.tone}`}>
                  <s.Icon className="size-4" aria-hidden />
                  <span className="sr-only">{s.label}</span>
                </span>

                <div className="min-w-0">
                  <p>
                    <span className="font-medium tabular-nums">
                      {e.amount.toFixed(2)} USDC
                    </span>{" "}
                    to{" "}
                    <span className="font-mono text-sm">
                      {shortAddress(e.to)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {e.what}. Agent&apos;s reason: {e.reason}
                  </p>
                  {e.note && (
                    <p className="mt-1 break-words text-sm font-medium first-letter:uppercase">
                      {e.note}
                    </p>
                  )}
                  {e.tx && (
                    <a
                      href={explorerTx(e.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-spend underline-offset-4 hover:underline"
                    >
                      View transaction{" "}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </div>

                <time className="text-sm tabular-nums text-muted-foreground">
                  {e.time}
                </time>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {shown.length === 0 && (
        <p className="py-8 text-sm text-muted-foreground">
          Nothing here yet. Payments the wallet blocks or you decline will show
          up in this list.
        </p>
      )}
    </section>
  );
}