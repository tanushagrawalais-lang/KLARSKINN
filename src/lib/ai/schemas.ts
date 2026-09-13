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

export const analyzeDocumentResultSchema: z.ZodType<AnalyzeDocumentResult> = z.object({
  schemaVersion: z.string().min(1),
  concepts: z.array(
    z.object({
      name: z.string().min(1),
      kind: conceptKindSchema,
      summary: z.string().min(1),
      importance: z.number().int().min(1).max(5),
      pageNumbers: z.array(z.number().int().positive()),
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
      pageNumber: z.number().int().positive().optional(),
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
    ),
  });

export const generateExplanationResultSchema: z.ZodType<GenerateExplanationResult> = z.object({
  content: z.string().min(1),
  personalizationNote: z.string().min(1),
  usedInterest: z.string().optional(),
  claims: z.array(
    z.object({
      claimText: z.string().min(1),
      grounding: groundingKindSchema,
      sourceExcerpt: z.string().optional(),
      pageNumber: z.number().int().positive().optional(),
      conceptName: z.string().optional(),
    }),
  ),
  conceptsUsed: z.array(z.string()),
});
