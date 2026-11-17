-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "feedbackMode" TEXT NOT NULL DEFAULT 'after_submit',
ADD COLUMN     "feedbackReleasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "joinExpiresAt" TIMESTAMP(3);
