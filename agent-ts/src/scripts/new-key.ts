import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Generates a fresh random keypair. TESTNET USE ONLY.
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("address:    ", account.address);
console.log("private key:", privateKey);