import type { RateLimitKey, RateLimiter } from "@/lib/rate-limit/types";

type Bucket = {
  count: number;
  resetAt: number;
};

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: RateLimitKey): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const now = Date.now();
    const id = `${key.name}:${key.subject}`;
    const existing = this.buckets.get(id);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(id, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true };
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    return { allowed: true };
  }
}
