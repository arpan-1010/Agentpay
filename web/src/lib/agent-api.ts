const BASE = process.env.AGENT_API_URL ?? "http://127.0.0.1:4030";

export async function agentFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) {
    return Response.json(
      { error: "DASHBOARD_TOKEN is not set for the dashboard" },
      { status: 500 },
    );
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return Response.json({ error: "agent API unreachable" }, { status: 502 });
  }
}

export function isSameOrigin(req: Request, requireOrigin = false): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return !requireOrigin;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export const DEMO_READONLY = process.env.DEMO_READONLY === "1";

export function demoBlocked(): Response {
  return Response.json(
    { error: "This is a read-only public demo" },
    { status: 403 },
  );
}
