import { describe, expect, it } from "vitest";

import { GeminiProvider } from "@/lib/ai/gemini";
import { parseAnalyzeDocumentResult, parseJsonObject } from "@/lib/ai/schemas";
import { AIProviderError } from "@/lib/ai/errors";

const validPayload = {
  schemaVersion: "understanding.v1",
  overview: "A short lecture on derivatives.",
  inferredTitle: "Derivatives",
  topics: [{ name: "Limits", pageNumbers: [1] }],
  concepts: [
    {
      name: "Derivative",
      kind: "definition",
      summary: "The instantaneous rate of change.",
      importance: 5,
      pageNumbers: [1],
      sourceExcerpt: "the derivative is the slope of the tangent",
    },
  ],
  relations: [{ fromName: "Derivative", toName: "Limit", relationType: "depends_on" }],
  importantSections: [
    {
      heading: "Definition",
      pageNumber: 1,
      excerpt: "the derivative is the slope of the tangent",
      whyItMatters: "It is the core object of the lecture.",
    },
  ],
};

describe("structured understanding output", () => {
  it("accepts valid Gemini JSON", () => {
    const parsed = parseAnalyzeDocumentResult(validPayload, "understanding.v1");
    expect(parsed.concepts[0]?.pageNumbers).toEqual([1]);
    expect(parsed.overview).toContain("derivatives");
  });

  it("rejects concepts without page references", () => {
    expect(() =>
      parseAnalyzeDocumentResult(
        {
          ...validPayload,
          concepts: [{ ...validPayload.concepts[0], pageNumbers: [] }],
        },
        "understanding.v1",
      ),
    ).toThrow("INVALID_MODEL_OUTPUT");
  });
});

describe("GeminiProvider", () => {
  it("parses structured JSON from the model", async () => {
    const provider = new GeminiProvider({
      modelName: "gemini-2.0-flash",
      generateJson: async () => JSON.stringify(validPayload),
    });
    const result = await provider.analyzeDocument({
      documentId: "doc_1",
      title: "Lecture",
      schemaVersion: "understanding.v1",
      pages: [{ pageNumber: 1, text: "the derivative is the slope of the tangent" }],
    });
    expect(result.concepts).toHaveLength(1);
    expect(result.schemaVersion).toBe("understanding.v1");
  });

  it("retries once after invalid JSON", async () => {
    let calls = 0;
    const provider = new GeminiProvider({
      modelName: "gemini-2.0-flash",
      generateJson: async () => {
        calls += 1;
        if (calls === 1) {
          return "not-json";
        }
        return JSON.stringify(validPayload);
      },
    });
    const result = await provider.analyzeDocument({
      documentId: "doc_1",
      title: "Lecture",
      schemaVersion: "understanding.v1",
      pages: [{ pageNumber: 1, text: "text" }],
    });
    expect(calls).toBe(2);
    expect(result.topics[0]?.name).toBe("Limits");
  });

  it("fails when repaired output is still invalid", async () => {
    const provider = new GeminiProvider({
      modelName: "gemini-2.0-flash",
      generateJson: async () => "still-invalid",
    });
    await expect(
      provider.analyzeDocument({
        documentId: "doc_1",
        title: "Lecture",
        schemaVersion: "understanding.v1",
        pages: [{ pageNumber: 1, text: "text" }],
      }),
    ).rejects.toBeInstanceOf(AIProviderError);
  });

  it("does not implement explanation generation", async () => {
    const provider = new GeminiProvider({
      modelName: "gemini-2.0-flash",
      generateJson: async () => JSON.stringify(validPayload),
    });
    await expect(
      provider.generateExplanation({
        intent: { intentType: "explain_whole", prompt: "explain" },
        profile: {
          explanationStyle: "concise",
          detailLevel: "brief",
          modalities: ["text"],
          interests: [],
        },
        understanding: parseAnalyzeDocumentResult(validPayload, "understanding.v1"),
      }),
    ).rejects.toMatchObject({ code: "not_implemented" });
  });
});

describe("parseJsonObject", () => {
  it("strips markdown fences", () => {
    expect(parseJsonObject("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });
});
