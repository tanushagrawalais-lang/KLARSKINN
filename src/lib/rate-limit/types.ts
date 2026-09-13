export type RateLimitKey = {
  name: string;
  userId: string;
};

export interface RateLimiter {
  consume(key: RateLimitKey): Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
}
