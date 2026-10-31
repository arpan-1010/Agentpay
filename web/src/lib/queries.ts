"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentEvent, EventDto, StatusDto } from "@/lib/types";
import type { Approval, ApprovalDto } from "@/lib/types";
const DAY = 86_400;

function toEvent(d: EventDto): AgentEvent {
  return {
    id: `${d.ts}-${d.kind}-${d.tx ?? d.to.slice(-6)}-${d.amount}`,
    kind: d.kind,
    ts: d.ts,
    time: new Date(d.ts * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isToday: Math.floor(d.ts / DAY) === Math.floor(Date.now() / 1000 / DAY),
    amount: Number(d.amount),
    to: d.to,
    what: d.what,
    reason: d.reason,
    tx: d.tx ?? undefined,
    note: d.note ?? undefined,
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => getJson<StatusDto>("/api/status"),
    refetchInterval: 5000,
  });
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () =>
      (await getJson<EventDto[]>("/api/events")).map(toEvent),
    refetchInterval: 5000,
  });
}

export function usePauseToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "pause" | "resume") => {
      const res = await fetch(`/api/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`${action} failed with ${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["status"] }),
  });
}
function toApproval(d: ApprovalDto): Approval {
  return {
    id: d.id,
    amount: Number(d.amount),
    to: d.to,
    what: d.what,
    reason: d.reason,
    onAllowlist: d.onAllowlist,
    secondsLeft: Math.max(0, d.expiresAt - Math.floor(Date.now() / 1000)),
    totalSeconds: Math.max(1, d.expiresAt - d.ts),
  };
}

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: async () =>
      (await getJson<ApprovalDto[]>("/api/approvals")).map(toApproval),
    refetchInterval: 2000,
  });
}

export function useDecide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "decline";
    }) => {
      const res = await fetch(`/api/approvals/${id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`${action} failed with ${res.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}