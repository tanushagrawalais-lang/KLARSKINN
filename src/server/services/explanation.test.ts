import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as register } from "@/app/api/auth/register/route";
import { GET as getIntentOptions } from "@/app/api/documents/[id]/intent-options/route";
import { POST as uploadDocument } from "@/app/api/documents/route";
import { POST as createExplanation } from "@/app/api/explanations/route";
import { GET as getExplanationById } from "@/app/api/explanations/[id]/route";
import { PUT as putProfile } from "@/app/api/profile/route";
import { setAIProviderForTests } from "@/lib/ai";
import { AIProviderError } from "@/lib/ai/errors";
import type { AIProvider, AnalyzeDocumentResult, GenerateExplanationResult } from "@/lib/ai/types";
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
  relations: [],
  importantSections: [
    {
      heading: "Core definition",
      pageNumber: 1,
      excerpt: "the derivative is the slope of the tangent line",
      whyItMatters: "It is the main idea of the material.",
    },
  ],
};

function jsonRequest(path: string, body: unknown, method = "POST"): Request {
  return new Request(`${APP_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: APP_URL },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

async function createPdfBytes(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return pdf.save();
}

function stubProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    id: "gemini",
    modelName: "gemini-test",
    analyzeDocument: async () => analysis,
    generateIntentOptions: async () => ({
      options: [
        {
          intentType: "explain_concept",
          label: "Explain the derivative",
          prompt: "Explain the derivative using the lecture definition",
          targetConceptName: "Derivative",
        },
      ],
    }),
    generateExplanation: async () => ({
      content: "The derivative is the slope of the tangent line.",
      personalizationNote: "Structured style; no analogy.",
      claims: [
        {
          claimText: "The derivative is the slope of the tangent line.",
          grounding: "supported",
          pageNumber: 1,
          sourceExcerpt: "the derivative is the slope of the tangent line",
          conceptName: "Derivative",
        },
        {
          claimText: "Think of it as zooming in until the curve looks straight.",
          grounding: "explanatory_addition",
        },
      ],
      conceptsUsed: ["Derivative"],
    }),
    ...overrides,
  };
}

async function registerCompleteUser(email: string, interests: string[] = ["music"]) {
  const response = await register(jsonRequest("/api/auth/register", { email, password: PASSWORD }));
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { user: { id: string } };
  const profile = await putProfile(
    jsonRequest("/api/profile", {
      explanationStyle: "structured",
      detailPreference: "standard",
      learningPreferences: ["text"],
      interests,
    }),
  );
  expect(profile.status).toBe(200);
  return payload.user.id;
}

async function uploadAndUnderstand(userId: string) {
  const bytes = await createPdfBytes();
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], "notes.pdf", { type: "application/pdf" }));
  const uploaded = await uploadDocument(
    new Request(`${APP_URL}/api/documents`, { method: "POST", headers: { origin: APP_URL }, body: form }),
  );
  expect(uploaded.status).toBe(201);
  const payload = (await uploaded.json()) as { id: string };
  await processDocumentUnderstanding({ documentId: payload.id, userId });
  return payload.id;
}

describe("personalized grounded explanations", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    storage.objects.clear();
    setStorageProviderForTests(storage);
    setAIProviderForTests(stubProvider());
  });

  afterEach(() => {
    setStorageProviderForTests(undefined);
    setAIProviderForTests(undefined);
  });

  it("returns intent options and a grounded explanation for the owner", async () => {
    const userId = await registerCompleteUser(`exp-${randomUUID()}@example.com`);
    const documentId = await uploadAndUnderstand(userId);

    const options = await getIntentOptions(new Request(`${APP_URL}/api/documents/${documentId}/intent-options`), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(options.status).toBe(200);
    const optionPayload = (await options.json()) as { options: Array<{ intentType: string }> };
    expect(optionPayload.options[0]?.intentType).toBe("explain_concept");

    const created = await createExplanation(
      jsonRequest("/api/explanations", {
        documentId,
        intentType: "explain_concept",
        prompt: "Explain the derivative",
      }),
    );
    expect(created.status).toBe(201);
    const explanation = (await created.json()) as {
      id: string;
      usedInterest: string | null;
      claims: Array<{ grounding: string; pageNumber: number | null }>;
    };
    expect(explanation.usedInterest).toBeNull();
    expect(explanation.claims.some((claim) => claim.grounding === "supported" && claim.pageNumber === 1)).toBe(true);
    expect(explanation.claims.some((claim) => claim.grounding === "explanatory_addition")).toBe(true);

    const fetched = await getExplanationById(new Request(`${APP_URL}/api/explanations/${explanation.id}`), {
      params: Promise.resolve({ id: explanation.id }),
    });
    expect(fetched.status).toBe(200);
  });

  it("uses an interest only when an analogy is present", async () => {
    const analogy: GenerateExplanationResult = {
      content: "Like a speedometer in F1, the derivative is instantaneous rate of change.",
      personalizationNote: "Used a motorsports analogy for rate of change.",
      usedInterest: "motorsports",
      claims: [
        {
          claimText: "The derivative is instantaneous rate of change.",
          grounding: "supported",
          pageNumber: 1,
          conceptName: "Derivative",
        },
        {
          claimText: "Like a speedometer in F1.",
          grounding: "analogy",
        },
      ],
      conceptsUsed: ["Derivative"],
    };
    setAIProviderForTests(stubProvider({ generateExplanation: async () => analogy }));

    const userId = await registerCompleteUser(`int-${randomUUID()}@example.com`, ["motorsports"]);
    const documentId = await uploadAndUnderstand(userId);
    const created = await createExplanation(
      jsonRequest("/api/explanations", {
        documentId,
        intentType: "analogy",
        prompt: "Give an analogy for the derivative",
      }),
    );
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { usedInterest: string | null };
    expect(payload.usedInterest).toBe("motorsports");
  });

  it("returns 404 for another user's explanation and 409 before understanding is ready", async () => {
    const ownerId = await registerCompleteUser(`own-${randomUUID()}@example.com`);
    const documentId = await uploadAndUnderstand(ownerId);
    const created = await createExplanation(
      jsonRequest("/api/explanations", {
        documentId,
        intentType: "explain_whole",
        prompt: "Explain the lecture",
      }),
    );
    const { id } = (await created.json()) as { id: string };

    await registerCompleteUser(`oth-${randomUUID()}@example.com`);
    const peeked = await getExplanationById(new Request(`${APP_URL}/api/explanations/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(peeked.status).toBe(404);

    const bytes = await createPdfBytes();
    const form = new FormData();
    form.append("file", new File([Buffer.from(bytes)], "notes.pdf", { type: "application/pdf" }));
    const uploaded = await uploadDocument(
      new Request(`${APP_URL}/api/documents`, { method: "POST", headers: { origin: APP_URL }, body: form }),
    );
    const pending = (await uploaded.json()) as { id: string };
    const tooSoon = await createExplanation(
      jsonRequest("/api/explanations", {
        documentId: pending.id,
        intentType: "explain_whole",
        prompt: "Explain",
      }),
    );
    expect(tooSoon.status).toBe(409);
  });

  it("returns a safe error when Gemini explanation generation fails", async () => {
    setAIProviderForTests(
      stubProvider({
        generateExplanation: async () => {
          throw new AIProviderError({
            code: "invalid_output",
            message: "bad json",
            retryable: false,
          });
        },
      }),
    );
    const userId = await registerCompleteUser(`fail-${randomUUID()}@example.com`);
    const documentId = await uploadAndUnderstand(userId);
    const failed = await createExplanation(
      jsonRequest("/api/explanations", {
        documentId,
        intentType: "explain_whole",
        prompt: "Explain",
      }),
    );
    expect(failed.status).toBe(500);
    const payload = (await failed.json()) as { error: { message: string } };
    expect(payload.error.message).toBe("Could not generate an explanation");
  });
});
