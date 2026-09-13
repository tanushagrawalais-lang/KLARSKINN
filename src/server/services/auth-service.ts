import { Prisma } from "@prisma/client";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { credentialsSchema, loginSchema } from "@/lib/auth/schemas";
import { createSession, deleteSession, findValidSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MemoryRateLimiter } from "@/lib/rate-limit/memory";
import { badRequest, conflict, tooManyRequests, unauthorized } from "@/server/errors";

let authLimiter: MemoryRateLimiter | undefined;

function limiter() {
  authLimiter ??= new MemoryRateLimiter(getEnv().AUTH_RATE_LIMIT_PER_MINUTE, 60_000);
  return authLimiter;
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type PublicUser = {
  id: string;
  email: string;
};

export type SessionUser = PublicUser & {
  profileCompleted: boolean;
};

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Y2xhaW1zZWN1cmVkZHVtbXlzYWx0$Hk8nV3o1yQn0gkz2QkqS0u1y3o4p5q6r7s8t9u0v1w0";

export async function registerAccount(input: unknown, rateSubject: string) {
  const limit = await limiter().consume({ name: "register", subject: rateSubject });
  if (!limit.allowed) {
    throw tooManyRequests(limit.retryAfterSeconds);
  }

  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid registration details");
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        profile: {
          create: {
            modalities: [],
            interests: [],
          },
        },
      },
    });

    const session = await createSession(user.id);
    return {
      user: { id: user.id, email: user.email } satisfies PublicUser,
      profileCompleted: false,
      session,
    };
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw conflict("An account with this email already exists");
    }
    throw error;
  }
}

export async function authenticateAccount(input: unknown, rateSubject: string) {
  const limit = await limiter().consume({ name: "login", subject: rateSubject });
  if (!limit.allowed) {
    throw tooManyRequests(limit.retryAfterSeconds);
  }

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("auth.failure", { reason: "invalid_payload" });
    throw unauthorized("Invalid email or password");
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { profile: true },
  });

  const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordOk = await verifyPassword(hash, parsed.data.password);

  if (!user || user.deletedAt || !passwordOk) {
    logger.warn("auth.failure", { reason: "invalid_credentials" });
    throw unauthorized("Invalid email or password");
  }

  const session = await createSession(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSignedInAt: new Date() },
  });

  return {
    user: { id: user.id, email: user.email } satisfies PublicUser,
    profileCompleted: Boolean(user.profile?.completedAt),
    session,
  };
}

export async function endSession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) {
    return;
  }
  await deleteSession(sessionToken);
}

export async function getSessionUser(
  sessionToken: string | undefined,
): Promise<SessionUser | null> {
  if (!sessionToken) {
    return null;
  }

  const session = await findValidSession(sessionToken);
  if (!session) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    profileCompleted: Boolean(session.user.profile?.completedAt),
  };
}
