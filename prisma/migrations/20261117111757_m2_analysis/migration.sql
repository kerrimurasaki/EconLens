-- DropIndex
DROP INDEX "AIJob_userId_operation_inputHash_key";

-- AlterTable
ALTER TABLE "ConceptSuggestion" ADD COLUMN     "detailsJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EventCase" ADD COLUMN     "analysisJson" JSONB,
ADD COLUMN     "analysisMode" TEXT,
ADD COLUMN     "analysisModel" TEXT,
ADD COLUMN     "analysisPromptVersion" TEXT,
ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "AIJob_userId_operation_inputHash_idx" ON "AIJob"("userId", "operation", "inputHash");
