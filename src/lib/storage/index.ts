import { LocalStorageProvider } from "@/lib/storage/local";
import { createSupabaseStorageProvider } from "@/lib/storage/supabase";
import type { StorageProvider } from "@/lib/storage/types";
import { getEnv } from "@/lib/env";

let override: StorageProvider | undefined;

export function createStorageProvider(): StorageProvider {
  const env = getEnv();
  if (env.STORAGE_PROVIDER === "local") {
    return new LocalStorageProvider(env.LOCAL_STORAGE_DIR);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase storage is not configured");
  }

  return createSupabaseStorageProvider({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: env.SUPABASE_STORAGE_BUCKET,
  });
}

export function getStorageProvider(): StorageProvider {
  if (override) {
    return override;
  }
  return createStorageProvider();
}

export function setStorageProviderForTests(provider: StorageProvider | undefined): void {
  override = provider;
}
