import { z } from "zod";

import { intentTypeSchema } from "@/lib/ai/schemas";

export const createExplanationRequestSchema = z.object({
  documentId: z.string().min(1),
  intentType: intentTypeSchema,
  prompt: z.string().trim().min(1).max(4000),
  targetConceptId: z.string().min(1).optional(),
  targetSection: z.string().trim().max(200).optional(),
});
