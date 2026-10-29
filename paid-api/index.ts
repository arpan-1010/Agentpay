import { Hono, type MiddlewareHandler } from "hono";
import { createPublicClient, http, isHash, parseAbi, parseEventLogs, parseUnits, getAddress } from "viem";
import { baseSepolia } from "viem/chains";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const PAY_TO = getAddress(requireEnv("PAY_TO"));
const USDC = getAddress(requireEnv("USDC_ADDRESS"));
const PORT = Number(process.env.PORT ?? 4020);

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

const transferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const APIS = {
  basic: { path: "/api/price/basic", price: "0.01", returns: ["usd"], description: "ETH spot price in USD" },
  pro: {
    path: "/api/price/pro",
    price: "0.05",
    returns: ["usd", "change_24h_pct", "volume_24h_usd"],
    description: "ETH spot price plus 24h change and volume",
  },
};

const usedTx = new Set<string>();

async function verify(header: string, price: bigint): Promise<{ ok: true } | { ok: false; error: string }> {
  let txHash: unknown;
  try {
    txHash = JSON.parse(header).txHash;
  } catch {
    return { ok: false, error: "X-PAYMENT must be JSON like {\"txHash\":\"0x...\"}" };
  }
  if (typeof txHash !== "string" || !isHash(txHash)) return { ok: false, error: "invalid txHash" };
  if (usedTx.has(txHash)) return { ok: false, error: "this payment was already used" };

  usedTx.add(txHash);
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error("transaction reverted");
    const logs = parseEventLogs({ abi: transferAbi, eventName: "Transfer", logs: receipt.logs });
    const paid = logs.some(
      (l) =>
        l.address.toLowerCase() === USDC.toLowerCase() &&
        l.args.to.toLowerCase() === PAY_TO.toLowerCase() &&
        l.args.value >= price,
    );
    if (!paid) throw new Error("no USDC transfer of the required amount to the payee in this tx");
    return { ok: true };
  } catch (e) {
    usedTx.delete(txHash);
    return { ok: false, error: e instanceof Error ? e.message : "verification failed" };
  }
}

function paywall(priceUsdc: string, description: string): MiddlewareHandler {
  const price = parseUnits(priceUsdc, 6);
  return async (c, next) => {
    const header = c.req.header("X-PAYMENT");
    if (!header) {
      return c.json(
        {
          x402Version: 1,
          error: "payment required",
          accepts: [
            {
              scheme: "exact-tx",
              network: "base-sepolia",
              asset: USDC,
              payTo: PAY_TO,
              maxAmountRequired: price.toString(),
              resource: c.req.url,
              description,
            },
          ],
        },
        402,
      );
    }
    const result = await verify(header, price);
    if (!result.ok) return c.json({ error: result.error }, 402);
    await next();
  };
}

const spot = () => 3000 + Math.round((Math.random() - 0.5) * 4000) / 100;

const app = new Hono();

app.get("/catalog", (c) =>
  c.json({
    apis: Object.values(APIS).map((a) => ({
      path: a.path, price_usdc: a.price, returns: a.returns, description: a.description,
    })),
  }),
);

app.get(APIS.basic.path, paywall(APIS.basic.price, APIS.basic.description), (c) =>
  c.json({ usd: spot() }),
);

app.get(APIS.pro.path, paywall(APIS.pro.price, APIS.pro.description), (c) =>
  c.json({ usd: spot(), change_24h_pct: 1.8, volume_24h_usd: 12_400_000_000 }),
);

export default { port: PORT, fetch: app.fetch };