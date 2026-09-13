import { Prisma } from "@prisma/client";

import { profileUpdateSchema } from "@/lib/auth/schemas";
import { prisma } from "@/lib/db/prisma";
import { badRequest, notFound } from "@/server/errors";

export type ProfileResponse = {
  explanationStyle: string | null;
  detailPreference: string | null;
  learningPreferences: string[];
  interests: string[];
  profileCompleted: boolean;
};

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function toProfileResponse(profile: {
  explanationStyle: string | null;
  detailLevel: string | null;
  modalities: Prisma.JsonValue;
  interests: string[];
  completedAt: Date | null;
}): ProfileResponse {
  return {
    explanationStyle: profile.explanationStyle,
    detailPreference: profile.detailLevel,
    learningPreferences: asStringArray(profile.modalities),
    interests: profile.interests,
    profileCompleted: Boolean(profile.completedAt),
  };
}

export async function getProfileForUser(userId: string): Promise<ProfileResponse> {
  const profile = await prisma.learnerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw notFound();
  }
  return toProfileResponse(profile);
}

export async function updateProfileForUser(
  userId: string,
  input: unknown,
): Promise<ProfileResponse> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid profile");
  }

  const completedAt = new Date();
  const profile = await prisma.learnerProfile.update({
    where: { userId },
    data: {
      explanationStyle: parsed.data.explanationStyle,
      detailLevel: parsed.data.detailPreference,
      modalities: parsed.data.learningPreferences,
      interests: parsed.data.interests,
      completedAt,
    },
  });

  return toProfileResponse(profile);
}
