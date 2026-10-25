import { generateText } from "ai";
import { models, type ModelName } from "./llm";

const name = (process.argv[2] ?? "gemini") as ModelName;

const { text } = await generateText({
  model: models[name],
  prompt: "Reply with exactly one word: ready",
});

console.log(`${name} ->`, text);