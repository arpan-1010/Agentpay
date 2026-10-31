"use client";

import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

const HOLD_SECONDS = 1.2;

export function HoldToConfirm({
  label,
  onConfirm,
  className,
}: {
  label: string;
  onConfirm: () => void;
  className?: string;
}) {
  const progress = useMotionValue(0);
  const textColor = useTransform(
    progress,
    [0.45, 0.55],
    ["#d8402f", "#ffffff"],
  );
  const run = useRef<{ stop: () => void } | null>(null);
  const [holding, setHolding] = useState(false);

  function start() {
    run.current?.stop();
    setHolding(true);
    run.current = animate(progress, 1, {
      duration: HOLD_SECONDS,
      ease: "linear",
      onComplete: () => {
        run.current = null;
        setHolding(false);
        onConfirm();
      },
    });
  }

  function cancel() {
    if (!run.current) return;
    run.current.stop();
    run.current = null;
    setHolding(false);
    animate(progress, 0, { duration: 0.25, ease: "easeOut" });
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative h-10 w-full touch-none select-none overflow-hidden rounded-lg border border-signal text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-signal/40 ${className ?? ""}`}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 origin-left bg-signal"
        style={{ scaleX: progress }}
      />
      <motion.span className="relative" style={{ color: textColor }}>
        {holding ? "Keep holding…" : label}
      </motion.span>
    </button>
  );
}