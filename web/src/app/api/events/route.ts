import { agentFetch } from "@/lib/agent-api";

export async function GET() {
  return agentFetch("/events");
}