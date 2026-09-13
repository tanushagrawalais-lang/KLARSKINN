import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getEnv } from "@/lib/env";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export function sessionCookieOptions(expiresAt: Date) {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function readSessionToken(store?: CookieStore): Promise<string | undefined> {
  const cookieStore = store ?? (await cookies());
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function writeSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
}
