export type StorageObject = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

export interface StorageProvider {
  readonly id: string;
  put(object: StorageObject): Promise<{ key: string }>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
}
