import { explorerTx } from "@/lib/format";
import type { AgentEvent } from "@/lib/types";

const HEADERS = [
  "time_utc",
  "status",
  "amount_usdc",
  "to",
  "what",
  "agent_reason",
  "tx_hash",
  "note",
  "explorer_url",
];

function cell(value: string | undefined): string {
  let s = value ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export function eventsToCsv(events: AgentEvent[]): string {
  const rows = events.map((e) => [
    new Date(e.ts * 1000).toISOString(),
    e.kind,
    e.amount.toFixed(6),
    e.to,
    e.what,
    e.reason,
    e.tx,
    e.note,
    e.tx ? explorerTx(e.tx) : undefined,
  ]);
  return (
    [HEADERS, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}

export function downloadCsv(events: AgentEvent[]) {
  const blob = new Blob(["\uFEFF" + eventsToCsv(events)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agentpay-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}