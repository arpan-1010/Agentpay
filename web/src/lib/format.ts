export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const explorerTx = (hash: string) =>
  `https://sepolia.basescan.org/tx/${hash}`;
export const explorerAddress = (a: string) =>
  `https://sepolia.basescan.org/address/${a}`;

export function formatExpiry(hours: number) {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days > 0 ? `${days} days ${rest} hours` : `${rest} hours`;
}