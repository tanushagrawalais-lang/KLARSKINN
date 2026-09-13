import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as register } from "@/app/api/auth/register/route";
import { PUT as putProfile } from "@/app/api/profile/route";
import { DELETE as deleteDocument, GET as getDocument } from "@/app/api/documents/[id]/route";
import { GET as listDocuments, POST as uploadDocument } from "@/app/api/documents/route";
import { prisma } from "@/lib/db/prisma";
import { documentStorageKey } from "@/lib/documents/keys";
import { validatePdfUpload } from "@/lib/documents/validate";
import { MemoryStorageProvider } from "@/lib/storage/memory";
import { setStorageProviderForTests } from "@/lib/storage";
import { AppError } from "@/server/errors";

const APP_URL = "http://127.0.0.1:43147";
const PASSWORD = "correct-horse-1";

const storage = new MemoryStorageProvider();

async function createPdfBytes(pages = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    pdf.addPage();
  }
  return pdf.save();
}

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

async function uploadRequest(bytes: Uint8Array, filename: string, type: string, title?: string) {
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], filename, { type }));
  if (title) {
    form.append("title", title);
  }
  return new Request(`${APP_URL}/api/documents`, {
    method: "POST",
    headers: { origin: APP_URL },
    body: form,
  });
}

async function registerCompleteUser(email: string) {
  const response = await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { user: { id: string } };
  const profile = await putProfile(
    jsonRequest("/api/profile", {
      explanationStyle: "structured",
      detailPreference: "standard",
      learningPreferences: ["text"],
      interests: ["music"],
    }),
  );
  expect(profile.status).toBe(200);
  return payload.user.id;
}

describe("pdf validation", () => {
  it("accepts a PDF within size and page limits", async () => {
    const bytes = await createPdfBytes(2);
    const result = await validatePdfUpload(bytes, "notes.pdf", "application/pdf", {
      maxBytes: 5_000_000,
      maxPages: 5,
    });
    expect(result.pageCount).toBe(2);
  });

  it("rejects non-PDF bytes", async () => {
    await expect(
      validatePdfUpload(new Uint8Array([1, 2, 3, 4, 5]), "notes.pdf", "application/pdf", {
        maxBytes: 1000,
        maxPages: 5,
      }),
    ).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" } satisfies Partial<AppError>);
  });

  it("rejects files that exceed the byte limit", async () => {
    const bytes = await createPdfBytes(1);
    await expect(
      validatePdfUpload(bytes, "notes.pdf", "application/pdf", {
        maxBytes: 10,
        maxPages: 5,
      }),
    ).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects PDFs that exceed the page limit", async () => {
    const bytes = await createPdfBytes(3);
    await expect(
      validatePdfUpload(bytes, "notes.pdf", "application/pdf", {
        maxBytes: 5_000_000,
        maxPages: 2,
      }),
    ).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });
});

describe("document upload API", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    storage.objects.clear();
    setStorageProviderForTests(storage);
  });

  afterEach(() => {
    setStorageProviderForTests(undefined);
  });

  it("rejects unauthenticated uploads", async () => {
    const bytes = await createPdfBytes();
    const response = await uploadDocument(await uploadRequest(bytes, "notes.pdf", "application/pdf"));
    expect(response.status).toBe(401);
  });

  it("requires a completed profile before upload", async () => {
    await register(
      jsonRequest("/api/auth/register", {
        email: `inc-${randomUUID()}@example.com`,
        password: PASSWORD,
      }),
    );
    const bytes = await createPdfBytes();
    const response = await uploadDocument(await uploadRequest(bytes, "notes.pdf", "application/pdf"));
    expect(response.status).toBe(403);
  });

  it("stores a PDF and returns document metadata without storage keys", async () => {
    const userId = await registerCompleteUser(`doc-${randomUUID()}@example.com`);
    const bytes = await createPdfBytes(2);
    const response = await uploadDocument(
      await uploadRequest(bytes, "Lecture 1.pdf", "application/pdf", "Derivatives"),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      id: string;
      status: string;
      title: string;
      createdAt: string;
      storageKey?: string;
    };
    expect(payload.status).toBe("UPLOADED");
    expect(payload.title).toBe("Derivatives");
    expect(payload.storageKey).toBeUndefined();

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: payload.id } });
    expect(stored.userId).toBe(userId);
    expect(stored.storageKey).toBe(documentStorageKey(userId, payload.id));
    expect(stored.pageCount).toBe(2);
    expect(stored.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(storage.objects.has(stored.storageKey)).toBe(true);

    const listed = await listDocuments();
    const listedPayload = (await listed.json()) as { documents: Array<{ id: string; storageKey?: string }> };
    expect(listedPayload.documents.map((doc) => doc.id)).toContain(payload.id);
    expect(listedPayload.documents[0]?.storageKey).toBeUndefined();
  });

  it("returns 404 for another user's document", async () => {
    await registerCompleteUser(`owner-${randomUUID()}@example.com`);
    const bytes = await createPdfBytes();
    const uploaded = await uploadDocument(await uploadRequest(bytes, "notes.pdf", "application/pdf"));
    const { id } = (await uploaded.json()) as { id: string };

    await registerCompleteUser(`other-${randomUUID()}@example.com`);
    const peeked = await getDocument(new Request(`${APP_URL}/api/documents/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(peeked.status).toBe(404);

    const deleted = await deleteDocument(
      new Request(`${APP_URL}/api/documents/${id}`, { method: "DELETE", headers: { origin: APP_URL } }),
      { params: Promise.resolve({ id }) },
    );
    expect(deleted.status).toBe(404);
    expect(await prisma.document.findUnique({ where: { id } })).not.toBeNull();
  });

  it("lets the owner delete a document and its stored object", async () => {
    const userId = await registerCompleteUser(`del-${randomUUID()}@example.com`);
    const bytes = await createPdfBytes();
    const uploaded = await uploadDocument(await uploadRequest(bytes, "notes.pdf", "application/pdf"));
    const { id } = (await uploaded.json()) as { id: string };
    const key = documentStorageKey(userId, id);

    const deleted = await deleteDocument(
      new Request(`${APP_URL}/api/documents/${id}`, { method: "DELETE", headers: { origin: APP_URL } }),
      { params: Promise.resolve({ id }) },
    );
    expect(deleted.status).toBe(200);
    expect(storage.objects.has(key)).toBe(false);
    expect(await prisma.document.findUnique({ where: { id } })).toBeNull();
  });
});
