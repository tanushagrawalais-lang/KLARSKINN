import { AIProviderError } from "@/lib/ai/errors";
import {
  parseAnalyzeDocumentResult,
  parseGenerateExplanationResult,
  parseGenerateIntentOptionsResult,
  parseJsonObject,
} from "@/lib/ai/schemas";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIProvider,
  AnalyzeDocumentInput,
  AnalyzeDocumentResult,
  GenerateExplanationInput,
  GenerateExplanationResult,
  GenerateIntentOptionsInput,
  GenerateIntentOptionsResult,
} from "@/lib/ai/types";

export type GeminiGenerateJson = (prompt: string, pdfBase64?: string) => Promise<string>;

const ANALYSIS_INSTRUCTIONS = `You are analyzing academic study material for KLARSINN.
Return ONLY JSON matching this shape:
{
  "schemaVersion": string,
  "overview": string,
  "inferredTitle": string (optional),
  "topics": [{ "name": string, "pageNumbers": number[] }],
  "concepts": [{
    "name": string,
    "kind": "concept"|"definition"|"formula"|"example"|"section"|"visual"|"confusion",
    "summary": string,
    "importance": 1-5,
    "pageNumbers": number[],
    "sourceExcerpt": string (short quote from the material, optional),
    "metadata": object (optional; formulas, confusion notes)
  }],
  "relations": [{ "fromName": string, "toName": string, "relationType": string, "note": string (optional) }],
  "importantSections": [{ "heading": string (optional), "pageNumber": number, "excerpt": string, "whyItMatters": string }]
}
Rules:
- Ground every concept and important section in 1-based source page numbers from the PDF.
- Do not invent pages that are not in the document.
- Distinguish definitions and formulas using kind.
- Relations may include prerequisites/depends_on when useful.
- Do not write a learner-facing explanation. This is structured understanding only.`;

const INTENT_INSTRUCTIONS = `You suggest what a learner might want to understand from structured document understanding.
Return ONLY JSON: { "options": [{ "intentType": "explain_concept"|"explain_section"|"explain_whole"|"simplify"|"analogy"|"clarify_confusion"|"custom", "label": string, "prompt": string, "targetConceptName"?: string, "targetSection"?: string }] }
Provide 3-6 concrete options grounded in the listed concepts/sections. Do not invent topics that are not present.`;

const EXPLANATION_INSTRUCTIONS = `You write a learner-facing explanation for KLARSINN grounded ONLY in the provided structured document understanding.
Return ONLY JSON:
{
  "content": string,
  "personalizationNote": string,
  "usedInterest": string (optional; omit unless an analogy truly helps),
  "claims": [{
    "claimText": string,
    "grounding": "supported"|"explanatory_addition"|"analogy",
    "sourceExcerpt": string (optional),
    "pageNumber": number (required when grounding is supported),
    "conceptName": string (optional)
  }],
  "conceptsUsed": string[]
}
Rules:
- Style and detail follow the learner profile. Modalities may shape how you explain (e.g. worked example), not the facts.
- Facts that come from the material MUST use grounding "supported" and a real pageNumber from the understanding.
- Pedagogical glue uses "explanatory_addition". It must not be presented as lecture fact.
- Analogies use "analogy". Include an interest-based analogy only if it clearly helps comprehension; otherwise omit usedInterest.
- Never force an interest into the explanation.
- Do not invent page numbers.`;

function toProviderError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "Upstream model error";
  if (error instanceof SyntaxError || message === "INVALID_MODEL_OUTPUT") {
    return new AIProviderError({
      code: "invalid_output",
      message: "Model returned invalid structured output",
      retryable: false,
    });
  }
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: number }).status)
      : undefined;
  if (status === 429) {
    return new AIProviderError({ code: "rate_limited", message: "Model rate limited", retryable: true });
  }
  if (status && status >= 500) {
    return new AIProviderError({ code: "upstream", message: "Model unavailable", retryable: true });
  }
  return new AIProviderError({ code: "upstream", message: "Model call failed", retryable: true });
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly modelName: string;
  private readonly generateJson: GeminiGenerateJson;

  constructor(params: { modelName: string; generateJson: GeminiGenerateJson }) {
    this.modelName = params.modelName;
    this.generateJson = params.generateJson;
  }

  private async generateParsed<T>(prompt: string, parse: (value: unknown) => T, pdfBase64?: string): Promise<T> {
    try {
      const raw = await this.generateJson(prompt, pdfBase64);
      return parse(parseJsonObject(raw));
    } catch (error) {
      const first = toProviderError(error);
      if (first.code !== "invalid_output") {
        throw first;
      }
      try {
        const repaired = await this.generateJson(
          `${prompt}\nYour previous JSON was invalid. Return valid JSON only.`,
          pdfBase64,
        );
        return parse(parseJsonObject(repaired));
      } catch (retryError) {
        throw toProviderError(retryError);
      }
    }
  }

  async analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentResult> {
    const prompt = [
      ANALYSIS_INSTRUCTIONS,
      `schemaVersion: ${input.schemaVersion}`,
      `documentTitle: ${input.title}`,
      `pageCountHint: ${input.pages.length}`,
      input.source
        ? "The PDF is attached. Use its actual pages."
        : `Page text:\n${input.pages.map((page) => `--- page ${page.pageNumber} ---\n${page.text}`).join("\n")}`,
    ].join("\n");

    const pdfBase64 = input.source ? Buffer.from(input.source.bytes).toString("base64") : undefined;
    return this.generateParsed(
      prompt,
      (value) => parseAnalyzeDocumentResult(value, input.schemaVersion),
      pdfBase64,
    );
  }

  async generateIntentOptions(
    input: GenerateIntentOptionsInput,
  ): Promise<GenerateIntentOptionsResult> {
    const prompt = [
      INTENT_INSTRUCTIONS,
      `documentTitle: ${input.documentTitle}`,
      `concepts: ${JSON.stringify(input.concepts)}`,
      `importantSections: ${JSON.stringify(input.importantSections)}`,
    ].join("\n");
    return this.generateParsed(prompt, parseGenerateIntentOptionsResult);
  }

  async generateExplanation(input: GenerateExplanationInput): Promise<GenerateExplanationResult> {
    const prompt = [
      EXPLANATION_INSTRUCTIONS,
      `intent: ${JSON.stringify(input.intent)}`,
      `learnerProfile: ${JSON.stringify(input.profile)}`,
      `documentUnderstanding: ${JSON.stringify(input.understanding)}`,
    ].join("\n");
    return this.generateParsed(prompt, parseGenerateExplanationResult);
  }
}

export function createGeminiGenerateJson(apiKey: string, modelName: string): GeminiGenerateJson {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  return async (prompt, pdfBase64) => {
    const parts = pdfBase64
      ? [
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          { text: prompt },
        ]
      : [{ text: prompt }];
    const result = await model.generateContent(parts);
    const text = result.response.text();
    if (!text) {
      throw new AIProviderError({
        code: "invalid_output",
        message: "Model returned empty output",
        retryable: false,
      });
    }
    return text;
  };
}
