export type RateLimitKey = {
  name: string;
  subject: string;
};

export interface RateLimiter {
  consume(key: RateLimitKey): Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
}
