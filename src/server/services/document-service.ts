import { createHash } from "node:crypto";

import { DocumentStatus, type Document } from "@prisma/client";

import { documentStorageKey, safeFilename, titleFromFilename } from "@/lib/documents/keys";
import { validatePdfUpload } from "@/lib/documents/validate";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MemoryRateLimiter } from "@/lib/rate-limit/memory";
import { getStorageProvider } from "@/lib/storage";
import { requireCompletedProfile } from "@/server/auth";
import { notFound, tooManyRequests } from "@/server/errors";

export type PublicDocument = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  pageCount: number | null;
  documentType: "pdf";
  status: DocumentStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let uploadLimiter: MemoryRateLimiter | undefined;

function limiter() {
  uploadLimiter ??= new MemoryRateLimiter(getEnv().UPLOAD_RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  return uploadLimiter;
}

function toPublicDocument(document: Document): PublicDocument {
  return {
    id: document.id,
    title: document.title,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    byteSize: document.byteSize,
    pageCount: document.pageCount,
    documentType: "pdf",
    status: document.status,
    failureCode: document.failureCode,
    failureMessage: document.failureMessage,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function ownedDocument(userId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
  });
  if (!document) {
    throw notFound();
  }
  return document;
}

export async function listDocumentsForCurrentUser() {
  const user = await requireCompletedProfile();
  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return documents.map(toPublicDocument);
}

export async function getDocumentForCurrentUser(documentId: string) {
  const user = await requireCompletedProfile();
  const document = await ownedDocument(user.id, documentId);
  return toPublicDocument(document);
}

export async function deleteDocumentForCurrentUser(documentId: string) {
  const user = await requireCompletedProfile();
  const document = await ownedDocument(user.id, documentId);
  const storage = getStorageProvider();
  await storage.delete(document.storageKey);
  await prisma.document.delete({ where: { id: document.id } });
  logger.info("document.deleted", { documentId: document.id, userId: user.id });
}

export async function uploadPdfForCurrentUser(input: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  title?: string;
}) {
  const user = await requireCompletedProfile();
  const limit = await limiter().consume({ name: "upload", subject: user.id });
  if (!limit.allowed) {
    throw tooManyRequests(limit.retryAfterSeconds);
  }

  const env = getEnv();
  const originalFilename = safeFilename(input.filename);
  const validated = await validatePdfUpload(input.bytes, originalFilename, input.mimeType, {
    maxBytes: env.MAX_UPLOAD_BYTES,
    maxPages: env.MAX_UPLOAD_PAGES,
  });

  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const title = input.title?.trim() || titleFromFilename(originalFilename);

  const created = await prisma.document.create({
    data: {
      userId: user.id,
      title,
      originalFilename,
      mimeType: validated.mimeType,
      byteSize: input.bytes.byteLength,
      pageCount: validated.pageCount,
      documentType: "pdf",
      storageKey: "pending",
      status: DocumentStatus.VALIDATING,
      contentHash,
    },
  });

  const storageKey = documentStorageKey(user.id, created.id);
  const storage = getStorageProvider();

  try {
    await storage.put({
      key: storageKey,
      bytes: input.bytes,
      contentType: "application/pdf",
    });

    const uploaded = await prisma.document.update({
      where: { id: created.id },
      data: {
        storageKey,
        status: DocumentStatus.UPLOADED,
      },
    });

    logger.info("document.uploaded", {
      documentId: uploaded.id,
      userId: user.id,
      byteSize: uploaded.byteSize,
      pageCount: uploaded.pageCount,
      status: uploaded.status,
    });

    const { enqueueDocumentProcessing } = await import("@/lib/jobs");
    enqueueDocumentProcessing(uploaded.id, user.id);

    return toPublicDocument(uploaded);
  } catch (error) {
    await prisma.document.update({
      where: { id: created.id },
      data: {
        status: DocumentStatus.FAILED,
        failureCode: "STORAGE",
        failureMessage: "Could not store the document",
      },
    });
    logger.error("document.storage_failed", {
      documentId: created.id,
      userId: user.id,
    });
    throw error;
  }
}
