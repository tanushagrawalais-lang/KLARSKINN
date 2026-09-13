import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as register } from "@/app/api/auth/register/route";
import { GET as getUnderstanding } from "@/app/api/documents/[id]/understanding/route";
import { POST as uploadDocument } from "@/app/api/documents/route";
import { PUT as putProfile } from "@/app/api/profile/route";
import { setAIProviderForTests } from "@/lib/ai";
import { AIProviderError } from "@/lib/ai/errors";
import type { AIProvider, AnalyzeDocumentResult } from "@/lib/ai/types";
import { prisma } from "@/lib/db/prisma";
import { MemoryStorageProvider } from "@/lib/storage/memory";
import { setStorageProviderForTests } from "@/lib/storage";
import { processDocumentUnderstanding } from "@/server/services/understanding-service";

const APP_URL = "http://127.0.0.1:43147";
const PASSWORD = "correct-horse-1";
const storage = new MemoryStorageProvider();

const analysis: AnalyzeDocumentResult = {
  schemaVersion: "understanding.v1",
  overview: "This lecture introduces derivatives as rates of change.",
  inferredTitle: "Introduction to derivatives",
  topics: [{ name: "Derivatives", pageNumbers: [1] }],
  concepts: [
    {
      name: "Derivative",
      kind: "definition",
      summary: "Instantaneous rate of change of a function.",
      importance: 5,
      pageNumbers: [1],
      sourceExcerpt: "the derivative is the slope of the tangent line",
    },
  ],
  relations: [{ fromName: "Derivative", toName: "Limit", relationType: "depends_on" }],
  importantSections: [
    {
      heading: "Core definition",
      pageNumber: 1,
      excerpt: "the derivative is the slope of the tangent line",
      whyItMatters: "It is the main idea of the material.",
    },
  ],
};

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_URL },
    body: JSON.stringify(body),
  });
}

async function createPdfBytes(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return pdf.save();
}

function stubProvider(analyze: AIProvider["analyzeDocument"]): AIProvider {
  return {
    id: "gemini",
    modelName: "gemini-test",
    analyzeDocument: analyze,
    generateIntentOptions: async () => {
      throw new Error("not implemented");
    },
    generateExplanation: async () => {
      throw new Error("not implemented");
    },
  };
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

async function uploadPdf() {
  const bytes = await createPdfBytes();
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], "notes.pdf", { type: "application/pdf" }));
  const response = await uploadDocument(
    new Request(`${APP_URL}/api/documents`, {
      method: "POST",
      headers: { origin: APP_URL },
      body: form,
    }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; status: string };
}

describe("document understanding", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    storage.objects.clear();
    setStorageProviderForTests(storage);
    setAIProviderForTests(
      stubProvider(async () => analysis),
    );
  });

  afterEach(() => {
    setStorageProviderForTests(undefined);
    setAIProviderForTests(undefined);
  });

  it("returns 409 until understanding is ready and persists page-grounded concepts", async () => {
    const userId = await registerCompleteUser(`u-${randomUUID()}@example.com`);
    const uploaded = await uploadPdf();
    expect(uploaded.status).toBe("UPLOADED");

    const pending = await getUnderstanding(new Request(`${APP_URL}/api/documents/${uploaded.id}/understanding`), {
      params: Promise.resolve({ id: uploaded.id }),
    });
    expect(pending.status).toBe(409);

    await processDocumentUnderstanding({ documentId: uploaded.id, userId });

    const ready = await getUnderstanding(new Request(`${APP_URL}/api/documents/${uploaded.id}/understanding`), {
      params: Promise.resolve({ id: uploaded.id }),
    });
    expect(ready.status).toBe(200);
    const payload = (await ready.json()) as {
      schemaVersion: string;
      modelName: string;
      overview: string;
      concepts: Array<{ name: string; pageNumbers: number[]; sourceExcerpt: string | null }>;
    };
    expect(payload.schemaVersion).toBe("understanding.v1");
    expect(payload.modelName).toBe("gemini-test");
    expect(payload.overview).toContain("derivatives");
    expect(payload.concepts[0]?.pageNumbers).toEqual([1]);
    expect(payload.concepts[0]?.sourceExcerpt).toContain("tangent");

    const document = await prisma.document.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(document.status).toBe("READY");
    expect(document.activeUnderstandingId).toBeTruthy();
  });

  it("hides another user's understanding", async () => {
    const ownerId = await registerCompleteUser(`owner-${randomUUID()}@example.com`);
    const uploaded = await uploadPdf();
    await processDocumentUnderstanding({ documentId: uploaded.id, userId: ownerId });

    await registerCompleteUser(`other-${randomUUID()}@example.com`);
    const peeked = await getUnderstanding(new Request(`${APP_URL}/api/documents/${uploaded.id}/understanding`), {
      params: Promise.resolve({ id: uploaded.id }),
    });
    expect(peeked.status).toBe(404);
  });

  it("marks the document failed when Gemini output cannot be used", async () => {
    setAIProviderForTests(
      stubProvider(async () => {
        throw new AIProviderError({
          code: "invalid_output",
          message: "bad json",
          retryable: false,
        });
      }),
    );
    const userId = await registerCompleteUser(`fail-${randomUUID()}@example.com`);
    const uploaded = await uploadPdf();
    await expect(
      processDocumentUnderstanding({ documentId: uploaded.id, userId }),
    ).rejects.toBeInstanceOf(AIProviderError);

    const document = await prisma.document.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(document.status).toBe("FAILED");
    expect(document.failureCode).toBe("INVALID_OUTPUT");
  });
});
