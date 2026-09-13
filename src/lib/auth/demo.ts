import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

export { isDemoMode } from "@/lib/auth/demo-mode";

export const DEMO_USER_EMAIL = "demo@klarsinn.internal";

const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Y2xhaW1zZWN1cmVkZHVtbXlzYWx0$Hk8nV3o1yQn0gkz2QkqS0u1y3o4p5q6r7s8t9u0v1w0";

export async function ensureDemoUser(): Promise<{
  id: string;
  email: string;
  profileCompleted: true;
}> {
  if (!getEnv().DEMO_MODE) {
    throw new Error("Demo user is only available when DEMO_MODE=true");
  }

  const existing = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    include: { profile: true },
  });

  if (existing) {
    if (!existing.profile?.completedAt) {
      await prisma.learnerProfile.upsert({
        where: { userId: existing.id },
        create: {
          userId: existing.id,
          explanationStyle: "structured",
          detailLevel: "standard",
          modalities: ["text"],
          interests: [],
          completedAt: new Date(),
        },
        update: {
          explanationStyle: "structured",
          detailLevel: "standard",
          modalities: ["text"],
          completedAt: new Date(),
        },
      });
    }

    return {
      id: existing.id,
      email: existing.email,
      profileCompleted: true,
    };
  }

  const created = await prisma.user.create({
    data: {
      email: DEMO_USER_EMAIL,
      passwordHash: DEMO_PASSWORD_HASH,
      profile: {
        create: {
          explanationStyle: "structured",
          detailLevel: "standard",
          modalities: ["text"],
          interests: [],
          completedAt: new Date(),
        },
      },
    },
  });

  return {
    id: created.id,
    email: created.email,
    profileCompleted: true,
  };
}
