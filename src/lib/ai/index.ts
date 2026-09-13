import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider } from "@/lib/ai/types";

/**
 * GeminiProvider is implemented in Phase 3.
 * Callers must depend on AIProvider, never on a vendor SDK.
 */
export function createAIProvider(): AIProvider {
  throw new Error("AIProvider is not implemented in Phase 0");
}
