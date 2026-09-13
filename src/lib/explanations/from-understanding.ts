import type { AnalyzeDocumentResult, ConceptKind } from "@/lib/ai/types";

export type UnderstandingSnapshot = {
  schemaVersion: string;
  overview: string | null;
  inferredTitle: string | null;
  topics: Array<{ name: string; pageNumbers: number[] }>;
  concepts: Array<{
    name: string;
    kind: ConceptKind;
    summary: string;
    importance: number;
    pageNumbers: number[];
    sourceExcerpt: string | null;
  }>;
  relations: AnalyzeDocumentResult["relations"];
  importantSections: AnalyzeDocumentResult["importantSections"];
};

export function understandingToAnalyzeResult(
  understanding: UnderstandingSnapshot,
): AnalyzeDocumentResult {
  return {
    schemaVersion: understanding.schemaVersion,
    overview: understanding.overview ?? "No overview available.",
    inferredTitle: understanding.inferredTitle ?? undefined,
    topics: understanding.topics,
    concepts: understanding.concepts.map((concept) => ({
      name: concept.name,
      kind: concept.kind,
      summary: concept.summary,
      importance: concept.importance,
      pageNumbers: concept.pageNumbers.length > 0 ? concept.pageNumbers : [1],
      sourceExcerpt: concept.sourceExcerpt ?? undefined,
    })),
    relations: understanding.relations,
    importantSections: understanding.importantSections,
  };
}
