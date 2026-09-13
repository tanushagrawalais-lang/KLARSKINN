import { IntentType, type GroundingKind, type Prisma } from "@prisma/client";

import { getAIProvider } from "@/lib/ai";
import { AIProviderError } from "@/lib/ai/errors";
import type { ExplanationStyle, DetailLevel } from "@/lib/ai/types";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { understandingToAnalyzeResult } from "@/lib/explanations/from-understanding";
import { createExplanationRequestSchema } from "@/lib/explanations/types";
import { logger } from "@/lib/logger";
import { MemoryRateLimiter } from "@/lib/rate-limit/memory";
import { requireCompletedProfile } from "@/server/auth";
import { AppError, badRequest, notFound, tooManyRequests } from "@/server/errors";
import { getProfileForUser } from "@/server/services/profile-service";
import { getUnderstandingForCurrentUser } from "@/server/services/understanding-service";

let aiLimiter: MemoryRateLimiter | undefined;

function limiter() {
  aiLimiter ??= new MemoryRateLimiter(getEnv().AI_RATE_LIMIT_PER_MINUTE, 60_000);
  return aiLimiter;
}

function mapAiFailure(
  error: unknown,
  event: string,
  fields: Record<string, string>,
  message = "Could not generate an explanation",
): never {
  logger.error(event, {
    ...fields,
    code: error instanceof AIProviderError ? error.code : "unknown",
  });
  if (error instanceof AIProviderError && error.code === "rate_limited") {
    throw tooManyRequests();
  }
  throw new AppError({
    code: "INTERNAL",
    message,
    status: 500,
    expose: true,
  });
}

export type PublicExplanationClaim = {
  claimText: string;
  grounding: GroundingKind;
  pageNumber: number | null;
  sourceExcerpt: string | null;
  conceptName: string | null;
};

export type PublicExplanation = {
  id: string;
  documentId: string;
  intent: {
    id: string;
    intentType: IntentType;
    prompt: string;
  };
  content: string;
  personalizationNote: string | null;
  usedInterest: string | null;
  claims: PublicExplanationClaim[];
  conceptsUsed: string[];
  modelProvider: string;
  modelName: string;
  createdAt: Date;
};

function asStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

async function toPublicExplanation(id: string): Promise<PublicExplanation> {
  const explanation = await prisma.explanation.findUnique({
    where: { id },
    include: {
      intent: true,
      claims: {
        include: {
          concept: true,
          sourceSpan: { include: { page: true } },
        },
      },
    },
  });
  if (!explanation) {
    throw notFound();
  }

  return {
    id: explanation.id,
    documentId: explanation.documentId,
    intent: {
      id: explanation.intent.id,
      intentType: explanation.intent.intentType,
      prompt: explanation.intent.prompt,
    },
    content: explanation.content,
    personalizationNote: explanation.personalizationNote,
    usedInterest: explanation.usedInterest,
    claims: explanation.claims.map((claim) => ({
      claimText: claim.claimText,
      grounding: claim.grounding,
      pageNumber: claim.sourceSpan?.page.pageNumber ?? null,
      sourceExcerpt: claim.sourceSpan?.excerpt ?? null,
      conceptName: claim.concept?.name ?? null,
    })),
    conceptsUsed: asStringArray(explanation.conceptsUsed),
    modelProvider: explanation.modelProvider,
    modelName: explanation.modelName,
    createdAt: explanation.createdAt,
  };
}

export async function getIntentOptionsForCurrentUser(documentId: string) {
  const user = await requireCompletedProfile();
  const limit = await limiter().consume({ name: "intent-options", subject: user.id });
  if (!limit.allowed) {
    throw tooManyRequests(limit.retryAfterSeconds);
  }

  const understanding = await getUnderstandingForCurrentUser(documentId);
  const provider = getAIProvider();
  try {
    return await provider.generateIntentOptions({
      documentTitle: understanding.inferredTitle ?? understanding.overview ?? "Study material",
      concepts: understanding.concepts.map((concept) => ({
        name: concept.name,
        kind: concept.kind,
        importance: concept.importance,
      })),
      importantSections: understanding.importantSections.map((section) => ({
        heading: section.heading,
        excerpt: section.excerpt,
      })),
    });
  } catch (error) {
    mapAiFailure(error, "ai.intent_options_failed", { documentId }, "Could not generate intent options");
  }
}

async function resolveClaimLinks(params: {
  documentId: string;
  understandingId: string;
  pageNumber?: number;
  excerpt?: string;
  conceptName?: string;
}) {
  const concept = params.conceptName
    ? await prisma.concept.findFirst({
        where: {
          understandingId: params.understandingId,
          name: { equals: params.conceptName, mode: "insensitive" },
        },
      })
    : null;

  if (!params.pageNumber) {
    return { conceptId: concept?.id, sourceSpanId: undefined };
  }

  const page = await prisma.documentPage.findUnique({
    where: {
      documentId_pageNumber: { documentId: params.documentId, pageNumber: params.pageNumber },
    },
  });
  if (!page) {
    return { conceptId: concept?.id, sourceSpanId: undefined };
  }

  const excerpt = params.excerpt?.slice(0, 280) ?? "";
  const existing = excerpt
    ? await prisma.sourceSpan.findFirst({
        where: { documentId: params.documentId, pageId: page.id, excerpt },
      })
    : await prisma.sourceSpan.findFirst({
        where: { documentId: params.documentId, pageId: page.id },
      });

  const span =
    existing ??
    (await prisma.sourceSpan.create({
      data: {
        documentId: params.documentId,
        pageId: page.id,
        excerpt: excerpt || "Source page",
      },
    }));

  return { conceptId: concept?.id, sourceSpanId: span.id };
}

export async function generateExplanationForCurrentUser(input: unknown) {
  const user = await requireCompletedProfile();
  const parsed = createExplanationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid explanation request");
  }

  const limit = await limiter().consume({ name: "explain", subject: user.id });
  if (!limit.allowed) {
    throw tooManyRequests(limit.retryAfterSeconds);
  }

  const profile = await getProfileForUser(user.id);
  if (!profile.explanationStyle || !profile.detailPreference) {
    throw badRequest("Complete your learning profile to continue");
  }

  const understanding = await getUnderstandingForCurrentUser(parsed.data.documentId);

  if (parsed.data.targetConceptId) {
    const concept = await prisma.concept.findFirst({
      where: {
        id: parsed.data.targetConceptId,
        understandingId: understanding.id,
        documentId: parsed.data.documentId,
      },
    });
    if (!concept) {
      throw badRequest("Unknown target concept");
    }
  }
  const provider = getAIProvider();
  const started = Date.now();

  const intent = await prisma.userIntent.create({
    data: {
      userId: user.id,
      documentId: parsed.data.documentId,
      understandingId: understanding.id,
      intentType: parsed.data.intentType,
      prompt: parsed.data.prompt,
      targetConceptId: parsed.data.targetConceptId,
      targetSection: parsed.data.targetSection,
    },
  });

  let generated;
  try {
    generated = await provider.generateExplanation({
      intent: {
        intentType: parsed.data.intentType,
        prompt: parsed.data.prompt,
      },
      profile: {
        explanationStyle: profile.explanationStyle as ExplanationStyle,
        detailLevel: profile.detailPreference as DetailLevel,
        modalities: profile.learningPreferences,
        interests: profile.interests,
      },
      understanding: understandingToAnalyzeResult(understanding),
    });
  } catch (error) {
    mapAiFailure(error, "ai.explanation_failed", { documentId: parsed.data.documentId });
  }

  const allowedInterest = generated.usedInterest
    ? profile.interests.find((interest) => interest.toLowerCase() === generated.usedInterest?.toLowerCase())
    : undefined;

  const explanation = await prisma.explanation.create({
    data: {
      userId: user.id,
      documentId: parsed.data.documentId,
      understandingId: understanding.id,
      intentId: intent.id,
      content: generated.content,
      personalizationNote: generated.personalizationNote,
      usedInterest: allowedInterest,
      conceptsUsed: generated.conceptsUsed,
      modelProvider: provider.id,
      modelName: provider.modelName,
      modelMetadata: {
        durationMs: Date.now() - started,
        schemaVersion: "explanation.v1",
      },
    },
  });

  for (const claim of generated.claims) {
    const links = await resolveClaimLinks({
      documentId: parsed.data.documentId,
      understandingId: understanding.id,
      pageNumber: claim.pageNumber,
      excerpt: claim.sourceExcerpt,
      conceptName: claim.conceptName,
    });
    await prisma.explanationClaim.create({
      data: {
        explanationId: explanation.id,
        claimText: claim.claimText,
        grounding: claim.grounding,
        conceptId: links.conceptId,
        sourceSpanId: links.sourceSpanId,
      },
    });
  }

  logger.info("explanation.created", {
    explanationId: explanation.id,
    documentId: parsed.data.documentId,
    durationMs: Date.now() - started,
  });

  return toPublicExplanation(explanation.id);
}

export async function getExplanationForCurrentUser(explanationId: string) {
  const user = await requireCompletedProfile();
  const explanation = await prisma.explanation.findFirst({
    where: { id: explanationId, userId: user.id },
  });
  if (!explanation) {
    throw notFound();
  }
  return toPublicExplanation(explanation.id);
}

export async function listExplanationsForCurrentUser(documentId: string) {
  const user = await requireCompletedProfile();
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId: user.id },
  });
  if (!document) {
    throw notFound();
  }

  const explanations = await prisma.explanation.findMany({
    where: { documentId, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return Promise.all(explanations.map((item) => toPublicExplanation(item.id)));
}
