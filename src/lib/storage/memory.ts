import type { StorageObject, StorageProvider } from "@/lib/storage/types";

export class MemoryStorageProvider implements StorageProvider {
  readonly id = "memory" as const;
  readonly objects = new Map<string, StorageObject>();

  async put(object: StorageObject): Promise<{ key: string }> {
    this.objects.set(object.key, {
      key: object.key,
      contentType: object.contentType,
      bytes: Uint8Array.from(object.bytes),
    });
    return { key: object.key };
  }

  async get(key: string): Promise<StorageObject | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
