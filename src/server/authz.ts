import { notFound } from "@/server/errors";

/**
 * Ownership check for user-owned resources.
 * Missing and foreign resources are indistinguishable to the caller.
 */
export function assertOwned(resourceUserId: string, sessionUserId: string): void {
  if (resourceUserId !== sessionUserId) {
    throw notFound();
  }
}
