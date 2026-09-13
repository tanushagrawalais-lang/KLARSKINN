import path from "node:path";

export function documentStorageKey(userId: string, documentId: string): string {
  return `${userId}/${documentId}/source.pdf`;
}

export function safeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[\u0000-\u001f]/g, "").trim();
  if (!base) {
    return "document.pdf";
  }
  return base.slice(0, 255);
}

export function titleFromFilename(filename: string): string {
  const safe = safeFilename(filename);
  return safe.replace(/\.pdf$/i, "") || "Untitled material";
}
