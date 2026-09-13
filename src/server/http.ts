import { getEnv } from "@/lib/env";
import { badRequest } from "@/server/errors";

export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const env = getEnv();
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === env.APP_URL) {
      return;
    }
    throw badRequest("Invalid request origin");
  }

  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site" || site === "none") {
    return;
  }

  throw badRequest("Invalid request origin");
}

export function clientSubject(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.headers.get("x-real-ip") ?? "local";
}
