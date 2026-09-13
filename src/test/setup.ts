import { beforeEach, vi } from "vitest";

const testEnv = process.env as Record<string, string | undefined>;
testEnv.NODE_ENV = "test";
testEnv.APP_URL = "http://127.0.0.1:43147";
testEnv.DATABASE_URL =
  "postgresql://klarsinn:klarsinn@127.0.0.1:5432/klarsinn_test?schema=public";
testEnv.AUTH_SECRET = "test-auth-secret-must-be-at-least-32-chars";
testEnv.AUTH_RATE_LIMIT_PER_MINUTE = "1000";
testEnv.UPLOAD_RATE_LIMIT_PER_HOUR = "1000";
testEnv.STORAGE_PROVIDER = "local";
testEnv.DIRECT_URL = testEnv.DATABASE_URL;

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (
      nameOrCookie: string | { name: string; value: string },
      value?: string,
    ) => {
      if (typeof nameOrCookie === "string") {
        cookieStore.set(nameOrCookie, value ?? "");
        return;
      }
      cookieStore.set(nameOrCookie.name, nameOrCookie.value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

beforeEach(() => {
  cookieStore.clear();
});
