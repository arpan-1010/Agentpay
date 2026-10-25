import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// --- Providers (one client per service) ---

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

const mistral = createOpenAICompatible({
  name: "mistral",
  baseURL: "https://api.mistral.ai/v1",
  apiKey: process.env.MISTRAL_API_KEY,
});

// Kept for later HuggingFace use (not in the registry right now)
export const huggingface = createOpenAICompatible({
  name: "huggingface",
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_TOKEN,
});

// --- Model registry: the rest of the code only uses these names ---

export const models = {
  // Primary agent brain: free, long-context, built for agent work
  nemotron: nvidia("nvidia/nemotron-3-ultra-550b-a55b"),

  // Fast fallback
  gemini: google("gemini-3.8-flash"),

  // Code-focused model
  codestral: mistral("codestral-latest"),

};

export type ModelName = keyof typeof models;