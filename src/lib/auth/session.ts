import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string) {
  const env = getEnv();
  const sessionToken = createSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expiresAt,
    },
  });

  return { sessionToken, expiresAt };
}

export async function findValidSession(sessionToken: string) {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        include: { profile: true },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now() || session.user.deletedAt) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return session;
}

export async function deleteSession(sessionToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { sessionToken } });
}
