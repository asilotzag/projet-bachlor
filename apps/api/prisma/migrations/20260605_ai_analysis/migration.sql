-- Phase 3 : Module IA — table AiAnalysis

CREATE TABLE "AiAnalysis" (
    "id" SERIAL NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT,
    "extractedFields" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAnalysis_documentId_key" ON "AiAnalysis"("documentId");

ALTER TABLE "AiAnalysis"
    ADD CONSTRAINT "AiAnalysis_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
