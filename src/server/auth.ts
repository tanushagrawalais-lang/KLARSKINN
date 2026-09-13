import { readSessionToken } from "@/lib/auth/cookies";
import { getSessionUser, type SessionUser } from "@/server/services/auth-service";
import { forbidden, unauthorized } from "@/server/errors";

export async function requireUser(): Promise<SessionUser> {
  const token = await readSessionToken();
  const user = await getSessionUser(token);
  if (!user) {
    throw unauthorized();
  }
  return user;
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

export async function requireCompletedProfile(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.profileCompleted) {
    throw forbidden("Complete your learning profile to continue");
  }
  return user;
}
