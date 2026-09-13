import { z } from "zod";

import type {
  AnalyzeDocumentResult,
  GenerateExplanationResult,
  GenerateIntentOptionsResult,
} from "@/lib/ai/types";

export const conceptKindSchema = z.enum([
  "concept",
  "definition",
  "formula",
  "example",
  "section",
  "visual",
  "confusion",
]);

export const intentTypeSchema = z.enum([
  "explain_concept",
  "explain_section",
  "explain_whole",
  "simplify",
  "analogy",
  "clarify_confusion",
  "custom",
]);

export const groundingKindSchema = z.enum([
  "supported",
  "explanatory_addition",
  "analogy",
]);

const pageNumbersSchema = z.array(z.number().int().positive()).min(1);

export const analyzeDocumentResultSchema: z.ZodType<AnalyzeDocumentResult> = z.object({
  schemaVersion: z.string().min(1),
  overview: z.string().min(1),
  inferredTitle: z.string().min(1).optional(),
  topics: z.array(
    z.object({
      name: z.string().min(1),
      pageNumbers: pageNumbersSchema,
    }),
  ),
  concepts: z.array(
    z.object({
      name: z.string().min(1),
      kind: conceptKindSchema,
      summary: z.string().min(1),
      importance: z.number().int().min(1).max(5),
      pageNumbers: pageNumbersSchema,
      sourceExcerpt: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  relations: z.array(
    z.object({
      fromName: z.string().min(1),
      toName: z.string().min(1),
      relationType: z.string().min(1),
      note: z.string().optional(),
    }),
  ),
  importantSections: z.array(
    z.object({
      heading: z.string().optional(),
      pageNumber: z.number().int().positive(),
      excerpt: z.string().min(1),
      whyItMatters: z.string().min(1),
    }),
  ),
});

export const generateIntentOptionsResultSchema: z.ZodType<GenerateIntentOptionsResult> =
  z.object({
    options: z.array(
      z.object({
        intentType: intentTypeSchema,
        label: z.string().min(1),
        prompt: z.string().min(1),
        targetConceptName: z.string().optional(),
        targetSection: z.string().optional(),
      }),
    ).min(1),
  });

export const generateExplanationResultSchema: z.ZodType<GenerateExplanationResult> = z.object({
  content: z.string().min(1),
  personalizationNote: z.string().min(1),
  usedInterest: z.string().optional(),
  claims: z
    .array(
      z.object({
        claimText: z.string().min(1),
        grounding: groundingKindSchema,
        sourceExcerpt: z.string().optional(),
        pageNumber: z.number().int().positive().optional(),
        conceptName: z.string().optional(),
      }),
    )
    .min(1),
  conceptsUsed: z.array(z.string()),
});

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

export function parseAnalyzeDocumentResult(
  value: unknown,
  schemaVersion: string,
): AnalyzeDocumentResult {
  const parsed = analyzeDocumentResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("INVALID_MODEL_OUTPUT");
  }
  return {
    ...parsed.data,
    schemaVersion,
  };
}

export function parseGenerateIntentOptionsResult(value: unknown): GenerateIntentOptionsResult {
  const parsed = generateIntentOptionsResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("INVALID_MODEL_OUTPUT");
  }
  return parsed.data;
}

export function parseGenerateExplanationResult(value: unknown): GenerateExplanationResult {
  const parsed = generateExplanationResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("INVALID_MODEL_OUTPUT");
  }

  const supportedMissingPage = parsed.data.claims.some(
    (claim) => claim.grounding === "supported" && claim.pageNumber === undefined,
  );
  if (supportedMissingPage) {
    throw new Error("INVALID_MODEL_OUTPUT");
  }

  const hasAnalogy = parsed.data.claims.some((claim) => claim.grounding === "analogy");
  if (parsed.data.usedInterest && !hasAnalogy) {
    return {
      ...parsed.data,
      usedInterest: undefined,
    };
  }

  return parsed.data;
}
