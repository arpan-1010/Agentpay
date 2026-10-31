import { agentFetch, isSameOrigin } from "@/lib/agent-api";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  return agentFetch("/pause", { method: "POST" });
}