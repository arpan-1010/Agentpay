"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/components/count-up";
import { useAgentState } from "@/components/agent-state";
import type { Payment } from "@/lib/types";

const EASE = [0.16, 1, 0.3, 1] as const;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function AllowanceRail({
  payments,
  maxPerDay,
  maxPerTx,
  remainingToday,
}: {
  payments: Payment[];
  maxPerDay: number;
  maxPerTx: number;
  remainingToday: number;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const { status } = useAgentState();

  const left = Math.max(0, round(remainingToday));
  const spent = round(maxPerDay - left);

  const segments = payments.map((p, i) => {
    const before = payments.slice(0, i).reduce((sum, q) => sum + q.amount, 0);
    return {
      ...p,
      start: (before / maxPerDay) * 100,
      width: (p.amount / maxPerDay) * 100,
    };
  });
  const current = active === null ? null : segments[active];

  return (
    <section aria-labelledby="allowance-heading">
      <h1
        id="allowance-heading"
        className="max-w-[20ch] font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl"
      >
        {status === "active" ? (
          <>
            The agent can still spend{" "}
            <CountUp value={left} delay={0.3} className="tabular-nums" /> USDC
            today.
          </>
        ) : status === "paused" ? (
          "The agent is paused."
        ) : status === "expired" ? (
          "The agent's key has expired."
        ) : (
          "Access is revoked."
        )}
      </h1>
      <p className="mt-4 max-w-prose text-muted-foreground">
        {status === "active"
          ? `${spent.toFixed(2)} of today's ${maxPerDay.toFixed(2)} USDC limit is used. The limit resets at midnight UTC.`
          : status === "paused"
            ? `Nothing can be spent until you resume it. ${left.toFixed(2)} USDC of today's limit is still available.`
            : status === "expired"
              ? "The agent cannot spend until you renew its key. Limits and the allowlist stay as they are."
              : "The agent's key no longer works on the blockchain. To restore access, set a new agent key from your owner wallet."}
      </p>

      <div
        className={`mt-12 transition-opacity duration-300 ${status === "active" ? "" : "opacity-45"}`}
      >
        <div
          role="group"
          aria-label="Payments made today, shown against the daily limit"
          className="relative h-14 overflow-hidden rounded-full bg-muted"
        >
          {segments.map((s, i) => (
            <motion.button
              key={s.id}
              type="button"
              aria-label={`${s.amount.toFixed(2)} USDC for ${s.what} at ${s.time}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{
                scaleX: 1,
                opacity: active === null || active === i ? 1 : 0.35,
              }}
              transition={{
                scaleX: { delay: 0.3 + i * 0.14, duration: 0.8, ease: EASE },
                opacity: { duration: 0.2 },
              }}
              style={{ left: `${s.start}%`, width: `${s.width}%`, originX: 0 }}
              className="absolute inset-y-0 border-r-2 border-background bg-spend outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            />
          ))}
        </div>

        <div className="relative mt-3 h-12 text-sm text-muted-foreground">
          <div
            className="absolute left-0 top-0 h-2 rounded-b-[3px] border-x border-b border-foreground/25"
            style={{ width: `${(maxPerTx / maxPerDay) * 100}%` }}
          />
          <span className="absolute left-0 top-4">
            Max per payment {maxPerTx.toFixed(2)}
          </span>
          <span className="absolute right-0 top-4">
            Max per day {maxPerDay.toFixed(2)}
          </span>
        </div>

        <div className="mt-2 min-h-16" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div
              key={current ? current.id : "idle"}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {current ? (
                <>
                  <p>
                    <span className="font-medium tabular-nums">
                      {current.amount.toFixed(2)} USDC
                    </span>{" "}
                    for {current.what} at {current.time}
                  </p>
                  <p className="text-muted-foreground">
                    Agent&apos;s reason: {current.reason}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Each block is one payment. Hover or focus a block to see why
                  the agent made it.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}