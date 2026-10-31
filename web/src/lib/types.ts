export type AgentStatus = "active" | "paused" | "revoked" | "expired";
export type EventKind = "paid" | "declined" | "blocked";

export interface AgentEvent {
  id: string;
  kind: EventKind;
  ts: number;
  time: string;
  isToday: boolean;
  amount: number;
  to: string;
  what: string;
  reason: string;
  tx?: string;
  note?: string;
}

export interface Payment {
  id: string;
  amount: number;
  time: string;
  what: string;
  reason: string;
}

export interface Policy {
  wallet: string;
  maxPerTx: number;
  maxPerDay: number;
  agentExpiresInHours: number;
  walletUsdc: number;
  agentGasEth: number;
}

export interface StatusDto extends Policy {
  status: AgentStatus;
  remainingToday: number;
  agentAddress: string;
}

export interface EventDto {
  ts: number;
  kind: EventKind;
  amount: string;
  to: string;
  what: string;
  reason: string;
  tx: string | null;
  note: string | null;
}

export interface ApprovalDto {
  id: string;
  ts: number;
  expiresAt: number;
  amount: string;
  to: string;
  what: string;
  reason: string;
  onAllowlist: boolean;
}

export interface Approval {
  id: string;
  amount: number;
  to: string;
  what: string;
  reason: string;
  onAllowlist: boolean;
  secondsLeft: number;
  totalSeconds: number;
}