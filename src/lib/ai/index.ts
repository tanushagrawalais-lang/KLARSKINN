import { createGeminiGenerateJson, GeminiProvider } from "@/lib/ai/gemini";
import type { AIProvider } from "@/lib/ai/types";
import { getEnv } from "@/lib/env";

export type { AIProvider } from "@/lib/ai/types";

let override: AIProvider | undefined;

export function createAIProvider(): AIProvider {
  const env = getEnv();
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const modelName = env.GEMINI_MODEL ?? "gemini-2.0-flash";
  return new GeminiProvider({
    modelName,
    generateJson: createGeminiGenerateJson(env.GEMINI_API_KEY, modelName),
  });
}

export function getAIProvider(): AIProvider {
  if (override) {
    return override;
  }
  return createAIProvider();
}

export function setAIProviderForTests(provider: AIProvider | undefined): void {
  override = provider;
}
