import { generateText, stepCountIs } from "ai";
import { models, type ModelName } from "./llm";
import { basicTools } from "./tools/basic";

// Order matters: try the primary first, then fall back
const MODEL_ORDER: ModelName[] = ["codestral", "gemini", "nemotron"];

const SYSTEM_PROMPT =
  "You are a careful assistant. Use the provided tools for math and time. " +
  "Never guess a calculation. Keep answers short.";

export async function runAgent(prompt: string) {
  for (const name of MODEL_ORDER) {
    try {
      console.log(`\n[agent] trying model: ${name}`);

      const result = await generateText({
        model: models[name],
        system: SYSTEM_PROMPT,
        prompt,
        tools: basicTools,
        // Allow up to 5 steps: model asks for a tool -> we run it -> model continues
        stopWhen: stepCountIs(5),
      });

      // Show what the agent actually did, step by step
      result.steps.forEach((step, i) => {
        for (const call of step.toolCalls) {
          console.log(`[step ${i + 1}] tool call: ${call.toolName}`, JSON.stringify(call.input));
        }
        for (const res of step.toolResults) {
          console.log(`[step ${i + 1}] tool result:`, JSON.stringify(res.output));
        }
      });

      return { model: name, text: result.text };
    } catch (err: any) {
      const status = err?.statusCode ?? "n/a";
      console.log(`[agent] ${name} failed (HTTP ${status}): ${String(err?.message ?? err).slice(0, 100)}`);
      // loop continues to the next model
    }
  }

  throw new Error("All models failed");
}