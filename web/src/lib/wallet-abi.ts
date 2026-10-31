export const agentWalletAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "revokeAgent",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "setAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newAgent", type: "address" },
      { name: "expiry", type: "uint64" },
    ],
    outputs: [],
  },
] as const;