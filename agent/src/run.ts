import { runAgent } from "./agent";

const prompt =
  process.argv.slice(2).join(" ") ||
  "What is 1234 multiplied by 5678, and what time is it in Asia/Kolkata right now?";

const { model, text } = await runAgent(prompt);

console.log(`\n[answer from ${model}]\n${text}`);