import type { Job, JobQueue } from "@/lib/jobs/types";
import { logger } from "@/lib/logger";

export class InMemoryJobQueue implements JobQueue {
  private readonly pending: Job[] = [];
  private running = 0;
  private started = false;

  constructor(
    private readonly concurrency: number,
    private readonly handler: (job: Job) => Promise<void>,
  ) {}

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
    try {
      await this.handler(job);
    } catch (error) {
      logger.error("job.unhandled", {
        jobName: job.name,
        documentId: job.documentId,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}

export function createJobQueue(
  concurrency: number,
  handler: (job: Job) => Promise<void>,
): JobQueue {
  return new InMemoryJobQueue(concurrency, handler);
}
