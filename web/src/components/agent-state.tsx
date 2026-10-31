"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePauseToggle, useStatus } from "@/lib/queries";
import type { AgentStatus } from "@/lib/types";

interface AgentState {
  status: AgentStatus;
  busy: boolean;
  togglePause: () => void;
}

const Ctx = createContext<AgentState | null>(null);

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const server = useStatus();
  const { mutate, isPending } = usePauseToggle();
  const status: AgentStatus = server.data?.status ?? "active";

  const value = useMemo<AgentState>(
    () => ({
      status,
      busy: isPending,
      togglePause: () => {
        if (status === "active") mutate("pause");
        else if (status === "paused") mutate("resume");
      },
    }),
    [status, isPending, mutate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentState() {
  const value = useContext(Ctx);
  if (!value)
    throw new Error("useAgentState must be used inside AgentStateProvider");
  return value;
}