export type DocumentStatus =
  | "UPLOADED"
  | "VALIDATING"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export type IntentType =
  | "explain_concept"
  | "explain_section"
  | "explain_whole"
  | "simplify"
  | "analogy"
  | "clarify_confusion"
  | "custom";

export type GroundingKind = "supported" | "explanatory_addition" | "analogy";

export type PublicDocument = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  pageCount: number | null;
  documentType: "pdf";
  status: DocumentStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicConcept = {
  id: string;
  name: string;
  kind: string;
  summary: string;
  importance: number;
  pageNumbers: number[];
  sourceExcerpt: string | null;
};

export type PublicUnderstanding = {
  id: string;
  documentId: string;
  overview: string | null;
  inferredTitle: string | null;
  topics: Array<{ name: string; pageNumbers: number[] }>;
  concepts: PublicConcept[];
  importantSections: Array<{
    heading?: string;
    pageNumber: number;
    excerpt: string;
    whyItMatters: string;
  }>;
};

export type IntentOption = {
  intentType: IntentType;
  label: string;
  prompt: string;
  targetConceptName?: string;
  targetSection?: string;
};

export type PublicExplanationClaim = {
  claimText: string;
  grounding: GroundingKind;
  pageNumber: number | null;
  sourceExcerpt: string | null;
  conceptName: string | null;
};

export type PublicExplanation = {
  id: string;
  documentId: string;
  intent: {
    id: string;
    intentType: IntentType;
    prompt: string;
  };
  content: string;
  personalizationNote: string | null;
  usedInterest: string | null;
  claims: PublicExplanationClaim[];
  conceptsUsed: string[];
  createdAt: string;
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
