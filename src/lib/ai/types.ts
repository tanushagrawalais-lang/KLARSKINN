export type ConceptKind =
  | "concept"
  | "definition"
  | "formula"
  | "example"
  | "section"
  | "visual"
  | "confusion";

export type IntentType =
  | "explain_concept"
  | "explain_section"
  | "explain_whole"
  | "simplify"
  | "analogy"
  | "clarify_confusion"
  | "custom";

export type GroundingKind = "supported" | "explanatory_addition" | "analogy";

export type ExplanationStyle = "concise" | "structured" | "conversational" | "socratic";

export type DetailLevel = "brief" | "standard" | "thorough";

export type AnalyzeDocumentInput = {
  documentId: string;
  title: string;
  schemaVersion: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    hasVisual?: boolean;
  }>;
  source?: {
    mimeType: "application/pdf";
    bytes: Uint8Array;
  };
};

export type TopicSummary = {
  name: string;
  pageNumbers: number[];
};

export type AnalyzeDocumentResult = {
  schemaVersion: string;
  overview: string;
  inferredTitle?: string;
  topics: TopicSummary[];
  concepts: Array<{
    name: string;
    kind: ConceptKind;
    summary: string;
    importance: number;
    pageNumbers: number[];
    sourceExcerpt?: string;
    metadata?: Record<string, unknown>;
  }>;
  relations: Array<{
    fromName: string;
    toName: string;
    relationType: string;
    note?: string;
  }>;
  importantSections: Array<{
    heading?: string;
    pageNumber: number;
    excerpt: string;
    whyItMatters: string;
  }>;
};

export type GenerateIntentOptionsInput = {
  documentTitle: string;
  concepts: Array<{ name: string; kind: ConceptKind; importance: number }>;
  importantSections: Array<{ heading?: string; excerpt: string }>;
};

export type GenerateIntentOptionsResult = {
  options: Array<{
    intentType: IntentType;
    label: string;
    prompt: string;
    targetConceptName?: string;
    targetSection?: string;
  }>;
};

export type GenerateExplanationInput = {
  intent: {
    intentType: IntentType;
    prompt: string;
  };
  profile: {
    explanationStyle: ExplanationStyle;
    detailLevel: DetailLevel;
    modalities: string[];
    interests: string[];
    subjectContext?: string;
  };
  understanding: AnalyzeDocumentResult;
};

export type GenerateExplanationResult = {
  content: string;
  personalizationNote: string;
  usedInterest?: string;
  claims: Array<{
    claimText: string;
    grounding: GroundingKind;
    sourceExcerpt?: string;
    pageNumber?: number;
    conceptName?: string;
  }>;
  conceptsUsed: string[];
};

export interface AIProvider {
  readonly id: string;
  readonly modelName: string;
  analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentResult>;
  generateIntentOptions(
    input: GenerateIntentOptionsInput,
  ): Promise<GenerateIntentOptionsResult>;
  generateExplanation(input: GenerateExplanationInput): Promise<GenerateExplanationResult>;
}
