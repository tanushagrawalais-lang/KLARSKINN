import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AIProviderError } from "@/lib/ai/errors";
import type { Job } from "@/lib/jobs/types";
import { processDocumentUnderstanding } from "@/server/services/understanding-service";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processDocumentJob(job: Job): Promise<void> {
  const maxAttempts = getEnv().DOCUMENT_JOB_MAX_ATTEMPTS;
  const started = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await processDocumentUnderstanding({
        documentId: job.documentId,
        userId: job.userId,
      });
      logger.info("document.processed", {
        documentId: job.documentId,
        durationMs: Date.now() - started,
        status: "READY",
      });
      return;
    } catch (error) {
      const retryable = error instanceof AIProviderError && error.retryable;
      logger.error("document.processing_failed", {
        documentId: job.documentId,
        attempt,
        retryable,
        durationMs: Date.now() - started,
      });
      if (!retryable || attempt === maxAttempts) {
        return;
      }
      await delay(250 * attempt);
    }
  }
}
