-- CreateEnum
CREATE TYPE "ExplanationStyle" AS ENUM ('concise', 'structured', 'conversational', 'socratic');

-- CreateEnum
CREATE TYPE "DetailLevel" AS ENUM ('brief', 'standard', 'thorough');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('pdf', 'text', 'markdown', 'image');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "UnderstandingStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ConceptKind" AS ENUM ('concept', 'definition', 'formula', 'example', 'section', 'visual', 'confusion');

-- CreateEnum
CREATE TYPE "IntentType" AS ENUM ('explain_concept', 'explain_section', 'explain_whole', 'simplify', 'analogy', 'clarify_confusion', 'custom');

-- CreateEnum
CREATE TYPE "GroundingKind" AS ENUM ('supported', 'explanatory_addition', 'analogy');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignedInAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "explanationStyle" "ExplanationStyle",
    "detailLevel" "DetailLevel",
    "modalities" JSONB NOT NULL DEFAULT '[]',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subjectContext" TEXT,
    "additionalNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "documentType" "DocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL,
    "activeUnderstandingId" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "processingFinishedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "textContent" TEXT,
    "storageKey" TEXT,
    "metadata" JSONB,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentUnderstanding" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" "UnderstandingStatus" NOT NULL,
    "failureCode" TEXT,
    "modelMetadata" JSONB,
    "structuredExtras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentUnderstanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "understandingId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ConceptKind" NOT NULL,
    "summary" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSpan" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "heading" TEXT,
    "excerpt" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,

    CONSTRAINT "SourceSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptSourceSpan" (
    "conceptId" TEXT NOT NULL,
    "sourceSpanId" TEXT NOT NULL,

    CONSTRAINT "ConceptSourceSpan_pkey" PRIMARY KEY ("conceptId","sourceSpanId")
);

-- CreateTable
CREATE TABLE "UserIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "understandingId" TEXT NOT NULL,
    "intentType" "IntentType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "targetConceptId" TEXT,
    "targetSection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "understandingId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "personalizationNote" TEXT,
    "usedInterest" TEXT,
    "conceptsUsed" JSONB NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Explanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplanationClaim" (
    "id" TEXT NOT NULL,
    "explanationId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "grounding" "GroundingKind" NOT NULL,
    "conceptId" TEXT,
    "sourceSpanId" TEXT,

    CONSTRAINT "ExplanationClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerProfile_userId_key" ON "LearnerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_activeUnderstandingId_key" ON "Document"("activeUnderstandingId");

-- CreateIndex
CREATE INDEX "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_userId_status_idx" ON "Document"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "DocumentUnderstanding_documentId_createdAt_idx" ON "DocumentUnderstanding"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "Concept_understandingId_sortOrder_idx" ON "Concept"("understandingId", "sortOrder");

-- CreateIndex
CREATE INDEX "SourceSpan_pageId_idx" ON "SourceSpan"("pageId");

-- CreateIndex
CREATE INDEX "SourceSpan_documentId_idx" ON "SourceSpan"("documentId");

-- CreateIndex
CREATE INDEX "UserIntent_userId_documentId_createdAt_idx" ON "UserIntent"("userId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "Explanation_userId_documentId_createdAt_idx" ON "Explanation"("userId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "ExplanationClaim_explanationId_idx" ON "ExplanationClaim"("explanationId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_activeUnderstandingId_fkey" FOREIGN KEY ("activeUnderstandingId") REFERENCES "DocumentUnderstanding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUnderstanding" ADD CONSTRAINT "DocumentUnderstanding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_understandingId_fkey" FOREIGN KEY ("understandingId") REFERENCES "DocumentUnderstanding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSpan" ADD CONSTRAINT "SourceSpan_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSpan" ADD CONSTRAINT "SourceSpan_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptSourceSpan" ADD CONSTRAINT "ConceptSourceSpan_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptSourceSpan" ADD CONSTRAINT "ConceptSourceSpan_sourceSpanId_fkey" FOREIGN KEY ("sourceSpanId") REFERENCES "SourceSpan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntent" ADD CONSTRAINT "UserIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntent" ADD CONSTRAINT "UserIntent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntent" ADD CONSTRAINT "UserIntent_understandingId_fkey" FOREIGN KEY ("understandingId") REFERENCES "DocumentUnderstanding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntent" ADD CONSTRAINT "UserIntent_targetConceptId_fkey" FOREIGN KEY ("targetConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_understandingId_fkey" FOREIGN KEY ("understandingId") REFERENCES "DocumentUnderstanding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "UserIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationClaim" ADD CONSTRAINT "ExplanationClaim_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "Explanation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationClaim" ADD CONSTRAINT "ExplanationClaim_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationClaim" ADD CONSTRAINT "ExplanationClaim_sourceSpanId_fkey" FOREIGN KEY ("sourceSpanId") REFERENCES "SourceSpan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
