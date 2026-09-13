import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StorageObject, StorageProvider } from "@/lib/storage/types";

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || path.isAbsolute(key)) {
    throw new Error("Invalid storage key");
  }
}

export class LocalStorageProvider implements StorageProvider {
  readonly id = "local" as const;

  constructor(private readonly rootDir: string) {}

  async put(object: StorageObject): Promise<{ key: string }> {
    assertSafeKey(object.key);
    const fullPath = path.join(this.rootDir, object.key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, object.bytes);
    return { key: object.key };
  }

  async get(key: string): Promise<StorageObject | null> {
    assertSafeKey(key);
    const fullPath = path.join(this.rootDir, key);
    try {
      const bytes = await readFile(fullPath);
      return {
        key,
        bytes,
        contentType: "application/octet-stream",
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const fullPath = path.join(this.rootDir, key);
    try {
      await unlink(fullPath);
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}

export function createStorageProvider(rootDir: string): StorageProvider {
  return new LocalStorageProvider(rootDir);
}
