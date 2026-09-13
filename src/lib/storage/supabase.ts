import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { StorageObject, StorageProvider } from "@/lib/storage/types";

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    throw new Error("Invalid storage key");
  }
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly id = "supabase" as const;

  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async put(object: StorageObject): Promise<{ key: string }> {
    assertSafeKey(object.key);
    const { error } = await this.client.storage.from(this.bucket).upload(object.key, object.bytes, {
      contentType: object.contentType,
      upsert: false,
    });
    if (error) {
      throw new Error("Storage upload failed");
    }
    return { key: object.key };
  }

  async get(key: string): Promise<StorageObject | null> {
    assertSafeKey(key);
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) {
      return null;
    }
    const buffer = new Uint8Array(await data.arrayBuffer());
    return {
      key,
      bytes: buffer,
      contentType: data.type || "application/pdf",
    };
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error && !/not found|not exist/i.test(error.message)) {
      throw new Error("Storage delete failed");
    }
  }
}

export function createSupabaseStorageProvider(params: {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}): StorageProvider {
  const client = createClient(params.url, params.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseStorageProvider(client, params.bucket);
}
