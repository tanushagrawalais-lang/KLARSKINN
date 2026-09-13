import {
  DocumentStatus,
  UnderstandingStatus,
  type ConceptKind,
  type Prisma,
} from "@prisma/client";

import { getAIProvider } from "@/lib/ai";
import { AIProviderError } from "@/lib/ai/errors";
import type { AnalyzeDocumentResult } from "@/lib/ai/types";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MemoryRateLimiter } from "@/lib/rate-limit/memory";
import { getStorageProvider } from "@/lib/storage";
import { requireCompletedProfile } from "@/server/auth";
import { AppError, conflict, notFound, tooManyRequests } from "@/server/errors";

let aiLimiter: MemoryRateLimiter | undefined;

function limiter() {
  aiLimiter ??= new MemoryRateLimiter(getEnv().AI_RATE_LIMIT_PER_MINUTE, 60_000);
  return aiLimiter;
}

export type PublicUnderstanding = {
  id: string;
  documentId: string;
  schemaVersion: string;
  modelProvider: string;
  modelName: string;
  status: UnderstandingStatus;
  overview: string | null;
  inferredTitle: string | null;
  topics: Array<{ name: string; pageNumbers: number[] }>;
  concepts: Array<{
    id: string;
    name: string;
    kind: ConceptKind;
    summary: string;
    importance: number;
    pageNumbers: number[];
    sourceExcerpt: string | null;
  }>;
  relations: AnalyzeDocumentResult["relations"];
  importantSections: AnalyzeDocumentResult["importantSections"];
  createdAt: Date;
  completedAt: Date | null;
};

function extrasOf(value: Prisma.JsonValue | null): {
  overview?: string;
  inferredTitle?: string;
  topics?: Array<{ name: string; pageNumbers: number[] }>;
  relations?: AnalyzeDocumentResult["relations"];
  importantSections?: AnalyzeDocumentResult["importantSections"];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as {
    overview?: string;
    inferredTitle?: string;
    topics?: Array<{ name: string; pageNumbers: number[] }>;
    relations?: AnalyzeDocumentResult["relations"];
    importantSections?: AnalyzeDocumentResult["importantSections"];
  };
}

export async function getUnderstandingForCurrentUser(documentId: string): Promise<PublicUnderstanding> {
  const user = await requireCompletedProfile();
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId: user.id },
    include: {
      activeUnderstanding: {
        include: {
          concepts: {
            include: { sourceSpans: { include: { sourceSpan: { include: { page: true } } } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!document) {
    throw notFound();
  }

  const understanding = document.activeUnderstanding;
  if (!understanding || understanding.status !== UnderstandingStatus.READY || document.status !== DocumentStatus.READY) {
    throw conflict("Document understanding is not ready");
  }

  const extras = extrasOf(understanding.structuredExtras);
  return {
    id: understanding.id,
    documentId: document.id,
    schemaVersion: understanding.schemaVersion,
    modelProvider: understanding.modelProvider,
    modelName: understanding.modelName,
    status: understanding.status,
    overview: extras.overview ?? null,
    inferredTitle: extras.inferredTitle ?? null,
    topics: extras.topics ?? [],
    concepts: understanding.concepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      kind: concept.kind,
      summary: concept.summary,
      importance: concept.importance,
      pageNumbers: [
        ...new Set(
          concept.sourceSpans
            .map((link) => link.sourceSpan.page.pageNumber)
            .sort((a, b) => a - b),
        ),
      ],
      sourceExcerpt: concept.sourceSpans[0]?.sourceSpan.excerpt ?? null,
    })),
    relations: extras.relations ?? [],
    importantSections: extras.importantSections ?? [],
    createdAt: understanding.createdAt,
    completedAt: understanding.completedAt,
  };
}

async function failProcessing(params: {
  documentId: string;
  understandingId?: string;
  failureCode: string;
  failureMessage: string;
}) {
  if (params.understandingId) {
    await prisma.documentUnderstanding.update({
      where: { id: params.understandingId },
      data: {
        status: UnderstandingStatus.FAILED,
        failureCode: params.failureCode,
        completedAt: new Date(),
      },
    });
  }

  await prisma.document.update({
    where: { id: params.documentId },
    data: {
      status: DocumentStatus.FAILED,
      failureCode: params.failureCode,
      failureMessage: params.failureMessage,
      processingFinishedAt: new Date(),
    },
  });
}

export async function markDocumentProcessingFailed(params: {
  documentId: string;
  userId: string;
  failureCode: string;
  failureMessage: string;
}) {
  const document = await prisma.document.findFirst({
    where: { id: params.documentId, userId: params.userId },
  });
  if (!document) {
    return;
  }
  await failProcessing({
    documentId: document.id,
    failureCode: params.failureCode,
    failureMessage: params.failureMessage,
  });
}

export async function processDocumentUnderstanding(params: {
  documentId: string;
  userId: string;
}) {
  const env = getEnv();
  const document = await prisma.document.findFirst({
    where: { id: params.documentId, userId: params.userId },
  });
  if (!document) {
    throw notFound();
  }

  const limit = await limiter().consume({ name: "analyze-document", subject: params.userId });
  if (!limit.allowed) {
    throw tooManyRequests(limit.retryAfterSeconds);
  }

  const storage = getStorageProvider();
  const object = await storage.get(document.storageKey);
  if (!object) {
    await failProcessing({
      documentId: document.id,
      failureCode: "MISSING_OBJECT",
      failureMessage: "Uploaded file could not be retrieved",
    });
    throw new AIProviderError({
      code: "upstream",
      message: "Uploaded file could not be retrieved",
      retryable: false,
    });
  }

  const pageCount = document.pageCount && document.pageCount > 0 ? document.pageCount : 1;

  await prisma.document.update({
    where: { id: document.id },
    data: {
      status: DocumentStatus.PROCESSING,
      processingStartedAt: new Date(),
      processingFinishedAt: null,
      failureCode: null,
      failureMessage: null,
    },
  });

  const pageRecords = await Promise.all(
    Array.from({ length: pageCount }, async (_, index) => {
      const pageNumber = index + 1;
      return prisma.documentPage.upsert({
        where: {
          documentId_pageNumber: { documentId: document.id, pageNumber },
        },
        update: {},
        create: {
          documentId: document.id,
          pageNumber,
        },
      });
    }),
  );

  const pagesByNumber = new Map(pageRecords.map((page) => [page.pageNumber, page]));
  const provider = getAIProvider();

  const understanding = await prisma.documentUnderstanding.create({
    data: {
      documentId: document.id,
      schemaVersion: env.UNDERSTANDING_SCHEMA_VERSION,
      modelProvider: provider.id,
      modelName: provider.modelName,
      status: UnderstandingStatus.PROCESSING,
    },
  });

  const started = Date.now();

  try {
    const analysis = await provider.analyzeDocument({
      documentId: document.id,
      title: document.title,
      schemaVersion: env.UNDERSTANDING_SCHEMA_VERSION,
      pages: pageRecords.map((page) => ({ pageNumber: page.pageNumber, text: page.textContent ?? "" })),
      source: {
        mimeType: "application/pdf",
        bytes: object.bytes,
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const [index, concept] of analysis.concepts.entries()) {
        const pageNumbers = concept.pageNumbers.filter((pageNumber) => pagesByNumber.has(pageNumber));
        if (pageNumbers.length === 0) {
          continue;
        }

        const createdConcept = await tx.concept.create({
          data: {
            understandingId: understanding.id,
            documentId: document.id,
            name: concept.name,
            kind: concept.kind,
            summary: concept.summary,
            importance: concept.importance,
            sortOrder: index,
            metadata: (concept.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });

        for (const pageNumber of pageNumbers) {
          const page = pagesByNumber.get(pageNumber);
          if (!page) {
            continue;
          }
          const span = await tx.sourceSpan.create({
            data: {
              documentId: document.id,
              pageId: page.id,
              excerpt: concept.sourceExcerpt ?? concept.summary.slice(0, 280),
            },
          });
          await tx.conceptSourceSpan.create({
            data: {
              conceptId: createdConcept.id,
              sourceSpanId: span.id,
            },
          });
        }
      }

      await tx.documentUnderstanding.update({
        where: { id: understanding.id },
        data: {
          status: UnderstandingStatus.READY,
          completedAt: new Date(),
          modelMetadata: {
            durationMs: Date.now() - started,
            conceptCount: analysis.concepts.length,
          },
          structuredExtras: {
            overview: analysis.overview,
            inferredTitle: analysis.inferredTitle,
            topics: analysis.topics,
            relations: analysis.relations,
            importantSections: analysis.importantSections,
          },
        },
      });

      await tx.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.READY,
          activeUnderstandingId: understanding.id,
          processingFinishedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });
    });

    logger.info("document.understanding_ready", {
      documentId: document.id,
      understandingId: understanding.id,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof AppError && (error.code === "RATE_LIMITED" || error.code === "NOT_FOUND")) {
      throw error;
    }

    const failureCode =
      error instanceof AIProviderError
        ? error.code.toUpperCase()
        : error instanceof Error && error.message === "INVALID_MODEL_OUTPUT"
          ? "INVALID_MODEL_OUTPUT"
          : "PROCESSING";

    await failProcessing({
      documentId: document.id,
      understandingId: understanding.id,
      failureCode,
      failureMessage: "Document understanding failed",
    });

    logger.error("document.understanding_failed", {
      documentId: document.id,
      understandingId: understanding.id,
      failureCode,
      durationMs: Date.now() - started,
    });

    throw error;
  }
}
