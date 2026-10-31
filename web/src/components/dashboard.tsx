"use client";

import type { Address } from "viem";
import { AgentStateProvider } from "@/components/agent-state";
import { Header } from "@/components/header";
import { AllowanceRail } from "@/components/allowance-rail";
import { Activity } from "@/components/activity";
import { PolicyPanel } from "@/components/policy-panel";
import { RestoreAccess } from "@/components/restore-access";
import { RevokeAccess } from "@/components/revoke-access";
import { useEvents, useStatus } from "@/lib/queries";
import type { Payment } from "@/lib/types";
import { ApprovalBanner } from "@/components/approval-banner";

export function Dashboard() {
  return (
    <AgentStateProvider>
      <DashboardBody />
    </AgentStateProvider>
  );
}

function DashboardBody() {
  const status = useStatus();
  const events = useEvents();

  if (!status.data || !events.data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 pt-16 sm:px-8">
        {status.isError || events.isError ? (
          <section>
            <h1 className="font-display text-3xl tracking-tight">
              Can&apos;t reach the agent.
            </h1>
            <p className="mt-3 max-w-prose text-muted-foreground">
              Start it from the repo root, and check that DASHBOARD_TOKEN is the
              same in the agent&apos;s .env and in web/.env.local.
            </p>
            <code className="mt-4 inline-block rounded-lg bg-muted px-3 py-2 font-mono text-sm">
              cargo run -p agent -- serve
            </code>
          </section>
        ) : (
          <div aria-busy="true">
            <p className="text-muted-foreground">Connecting to the agent…</p>
            <div className="mt-6 h-14 rounded-full bg-muted motion-safe:animate-pulse" />
          </div>
        )}
      </main>
    );
  }

  const s = status.data;
  const payments: Payment[] = events.data
    .filter((e) => e.kind === "paid" && e.isToday)
    .map(({ id, amount, time, what, reason }) => ({
      id,
      amount,
      time,
      what,
      reason,
    }))
    .reverse();

  return (
    <>
      <Header expiresInHours={s.agentExpiresInHours} />
      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
        <ApprovalBanner />
        <AllowanceRail
          payments={payments}
          maxPerDay={s.maxPerDay}
          maxPerTx={s.maxPerTx}
          remainingToday={s.remainingToday}
        />

        <div className="mt-20 grid gap-16 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Activity events={events.data} />
          <div className="space-y-10 lg:sticky lg:top-8 lg:self-start">
            <PolicyPanel policy={s} />
            <RestoreAccess
              wallet={s.wallet as Address}
              agentAddress={s.agentAddress as Address}
            />
            <RevokeAccess wallet={s.wallet as Address} />
          </div>
        </div>
      </main>
    </>
  );
}