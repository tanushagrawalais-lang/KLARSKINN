import type { Job, JobQueue } from "@/lib/jobs/types";
import { logger } from "@/lib/logger";

/**
 * In-process FIFO queue. Status for documents must still live in PostgreSQL.
 * Document processing handlers are not wired in Phase 0.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly pending: Job[] = [];
  private running = 0;
  private started = false;

  constructor(private readonly concurrency: number) {}

  async enqueue(job: Job): Promise<void> {
    this.pending.push(job);
    this.pump();
  }

  start(): void {
    this.started = true;
    this.pump();
  }

  private pump(): void {
    if (!this.started) {
      return;
    }

    while (this.running < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) {
        return;
      }

      this.running += 1;
      void this.run(job).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    logger.info("job.received", {
      jobName: job.name,
      documentId: job.documentId,
    });
  }
}

export function createJobQueue(concurrency: number): JobQueue {
  return new InMemoryJobQueue(concurrency);
}
