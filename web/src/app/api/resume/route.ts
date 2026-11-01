import {
  agentFetch,
  isSameOrigin,
  DEMO_READONLY,
  demoBlocked,
} from "@/lib/agent-api";

export async function POST(req: Request) {
  if (DEMO_READONLY) return demoBlocked();
  if (!isSameOrigin(req)) {
    return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  return agentFetch("/resume", { method: "POST" });
}
