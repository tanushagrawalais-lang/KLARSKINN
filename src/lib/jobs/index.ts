import { InMemoryJobQueue } from "@/lib/jobs/memory";
import type { JobQueue } from "@/lib/jobs/types";
import { getEnv } from "@/lib/env";
import { processDocumentJob } from "@/lib/jobs/handlers/process-document";

let queue: JobQueue | undefined;

export function getJobQueue(): JobQueue {
  if (!queue) {
    const env = getEnv();
    queue = new InMemoryJobQueue(env.DOCUMENT_JOB_CONCURRENCY, processDocumentJob);
    if (env.NODE_ENV !== "test") {
      queue.start();
    }
  }
  return queue;
}

export function enqueueDocumentProcessing(documentId: string, userId: string): void {
  if (getEnv().NODE_ENV === "test") {
    return;
  }
  void getJobQueue().enqueue({
    name: "process-document",
    documentId,
    userId,
  });
}
