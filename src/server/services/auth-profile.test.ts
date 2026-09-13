import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as register } from "@/app/api/auth/register/route";
import { POST as signIn } from "@/app/api/auth/sign-in/route";
import { POST as signOut } from "@/app/api/auth/sign-out/route";
import { GET as me } from "@/app/api/me/route";
import { GET as getProfile, PUT as putProfile } from "@/app/api/profile/route";
import { GET as companion } from "@/app/api/companion/route";
import { prisma } from "@/lib/db/prisma";

const APP_URL = "http://127.0.0.1:43147";
const PASSWORD = "correct-horse-1";

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: APP_URL,
    },
    body: JSON.stringify(body),
  });
}

function uniqueEmail() {
  return `user-${randomUUID()}@example.com`;
}

const completeProfile = {
  explanationStyle: "structured",
  detailPreference: "standard",
  learningPreferences: ["text", "worked-examples"],
  interests: ["motorsports"],
};

describe("auth and learner profile", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registers a user with an incomplete profile and session", async () => {
    const email = uniqueEmail();
    const response = await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      user: { id: string; email: string; passwordHash?: string };
      profileCompleted: boolean;
    };
    expect(payload.user.email).toBe(email);
    expect(payload.user.passwordHash).toBeUndefined();
    expect(payload.profileCompleted).toBe(false);

    const meResponse = await me();
    expect(meResponse.status).toBe(200);
    const mePayload = (await meResponse.json()) as {
      authenticated: boolean;
      user: { id: string; email: string };
      profileCompleted: boolean;
    };
    expect(mePayload).toEqual({
      authenticated: true,
      user: { id: payload.user.id, email },
      profileCompleted: false,
    });
  });

  it("rejects duplicate registration", async () => {
    const email = uniqueEmail();
    const first = await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
    expect(first.status).toBe(200);
    const second = await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
    expect(second.status).toBe(409);
  });

  it("rejects invalid email", async () => {
    const response = await register(
      jsonRequest("/api/auth/register", { email: "not-an-email", password: PASSWORD }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a weak password", async () => {
    const response = await register(
      jsonRequest("/api/auth/register", { email: uniqueEmail(), password: "short" }),
    );
    expect(response.status).toBe(400);
  });

  it("signs in with valid credentials", async () => {
    const email = uniqueEmail();
    await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
    await signOut(jsonRequest("/api/auth/sign-out", {}));

    const response = await signIn(jsonRequest("/api/auth/sign-in", { email, password: PASSWORD }));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { user: { email: string } };
    expect(payload.user.email).toBe(email);
  });

  it("returns a generic error for failed login", async () => {
    const email = uniqueEmail();
    await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
    const response = await signIn(
      jsonRequest("/api/auth/sign-in", { email, password: "wrong-password-1" }),
    );
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: { message: string } };
    expect(payload.error.message).toBe("Invalid email or password");

    const missing = await signIn(
      jsonRequest("/api/auth/sign-in", {
        email: "missing@example.com",
        password: "wrong-password-1",
      }),
    );
    expect(missing.status).toBe(401);
    const missingPayload = (await missing.json()) as { error: { message: string } };
    expect(missingPayload.error.message).toBe("Invalid email or password");
  });

  it("returns unauthenticated /api/me without a session", async () => {
    const response = await me();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: false,
      user: null,
      profileCompleted: false,
    });
  });

  it("rejects unauthenticated profile access", async () => {
    const get = await getProfile();
    expect(get.status).toBe(401);
    const put = await putProfile(jsonRequest("/api/profile", completeProfile));
    expect(put.status).toBe(401);
  });

  it("creates and updates a learner profile and marks it complete", async () => {
    const email = uniqueEmail();
    await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));

    const initial = await getProfile();
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({
      explanationStyle: null,
      detailPreference: null,
      learningPreferences: [],
      interests: [],
      profileCompleted: false,
    });

    const blocked = await companion();
    expect(blocked.status).toBe(403);

    const updated = await putProfile(jsonRequest("/api/profile", completeProfile));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      ...completeProfile,
      profileCompleted: true,
    });

    const meResponse = await me();
    const mePayload = (await meResponse.json()) as { profileCompleted: boolean };
    expect(mePayload.profileCompleted).toBe(true);

    const allowed = await companion();
    expect(allowed.status).toBe(200);
  });

  it("logs out and clears the session", async () => {
    const email = uniqueEmail();
    await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
    const before = await me();
    expect(((await before.json()) as { authenticated: boolean }).authenticated).toBe(true);

    const logout = await signOut(jsonRequest("/api/auth/sign-out", {}));
    expect(logout.status).toBe(200);

    const after = await me();
    expect(await after.json()).toEqual({
      authenticated: false,
      user: null,
      profileCompleted: false,
    });

    const protectedGet = await getProfile();
    expect(protectedGet.status).toBe(401);
  });
});
