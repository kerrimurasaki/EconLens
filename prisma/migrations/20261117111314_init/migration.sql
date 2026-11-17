-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "ExperienceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('verified', 'teacher_provided', 'disputed', 'hypothetical', 'unverified');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('fact', 'claim', 'opinion', 'hypothesis', 'unknown');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NONE', 'NEEDS_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settingsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "term" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassEnrollment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumObjective" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "bloomLevel" TEXT NOT NULL,
    "conceptsJson" JSONB NOT NULL DEFAULT '[]',
    "prerequisitesJson" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "CurriculumObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "geography" TEXT,
    "factStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "eventCaseId" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "publicationDate" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3),
    "excerpt" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'unverified',

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceClaim" (
    "id" TEXT NOT NULL,
    "eventCaseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "sourceId" TEXT,

    CONSTRAINT "EvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptSuggestion" (
    "id" TEXT NOT NULL,
    "eventCaseId" TEXT NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "limitationsJson" JSONB NOT NULL DEFAULT '[]',
    "prerequisitesJson" JSONB NOT NULL DEFAULT '[]',
    "misconceptionJson" JSONB NOT NULL DEFAULT '[]',
    "selected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConceptSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventCaseId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ExperienceStatus" NOT NULL DEFAULT 'DRAFT',
    "durationMinutes" INTEGER NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'Foundation',
    "settingsJson" JSONB NOT NULL DEFAULT '{}',
    "currentVersionId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceVersion" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentJson" JSONB NOT NULL,
    "promptVersion" TEXT,
    "modelId" TEXT,
    "validationJson" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,

    CONSTRAINT "ExperienceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceBlock" (
    "id" TEXT NOT NULL,
    "experienceVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "contentJson" JSONB NOT NULL,
    "teacherNotesJson" JSONB NOT NULL DEFAULT '{}',
    "objectiveIdsJson" JSONB NOT NULL DEFAULT '[]',
    "sourceIdsJson" JSONB NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'student',

    CONSTRAINT "ExperienceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentItem" (
    "id" TEXT NOT NULL,
    "experienceVersionId" TEXT NOT NULL,
    "blockId" TEXT,
    "type" TEXT NOT NULL,
    "promptJson" JSONB NOT NULL,
    "optionsJson" JSONB,
    "answerKeyJson" JSONB NOT NULL,
    "explanationJson" JSONB,
    "rubricJson" JSONB,
    "objectiveId" TEXT,
    "independent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "publishedVersionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "joinExpiresAt" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NONE',
    "stateJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "assessmentItemId" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "autoScore" DOUBLE PRECISION,
    "teacherScore" DOUBLE PRECISION,
    "feedbackJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "inputHash" TEXT NOT NULL,
    "promptVersion" TEXT,
    "modelId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_joinCode_key" ON "Classroom"("joinCode");

-- CreateIndex
CREATE INDEX "Classroom_tenantId_teacherId_idx" ON "Classroom"("tenantId", "teacherId");

-- CreateIndex
CREATE INDEX "ClassEnrollment_studentId_idx" ON "ClassEnrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEnrollment_classId_studentId_key" ON "ClassEnrollment"("classId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumObjective_tenantId_code_key" ON "CurriculumObjective"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventCase_tenantId_createdAt_idx" ON "EventCase"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_eventCaseId_idx" ON "Source"("eventCaseId");

-- CreateIndex
CREATE INDEX "EvidenceClaim_eventCaseId_idx" ON "EvidenceClaim"("eventCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptSuggestion_eventCaseId_conceptKey_key" ON "ConceptSuggestion"("eventCaseId", "conceptKey");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_currentVersionId_key" ON "Experience"("currentVersionId");

-- CreateIndex
CREATE INDEX "Experience_tenantId_status_updatedAt_idx" ON "Experience"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceVersion_experienceId_versionNumber_key" ON "ExperienceVersion"("experienceId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceBlock_experienceVersionId_order_key" ON "ExperienceBlock"("experienceVersionId", "order");

-- CreateIndex
CREATE INDEX "AssessmentItem_experienceVersionId_independent_idx" ON "AssessmentItem"("experienceVersionId", "independent");

-- CreateIndex
CREATE INDEX "Assignment_classId_idx" ON "Assignment"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_experienceId_publishedVersionId_classId_key" ON "Assignment"("experienceId", "publishedVersionId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_assignmentId_studentId_key" ON "Attempt"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_attemptId_assessmentItemId_key" ON "Response"("attemptId", "assessmentItemId");

-- CreateIndex
CREATE INDEX "AIJob_tenantId_userId_createdAt_idx" ON "AIJob"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIJob_userId_operation_inputHash_key" ON "AIJob"("userId", "operation", "inputHash");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEnrollment" ADD CONSTRAINT "ClassEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEnrollment" ADD CONSTRAINT "ClassEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumObjective" ADD CONSTRAINT "CurriculumObjective_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCase" ADD CONSTRAINT "EventCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCase" ADD CONSTRAINT "EventCase_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_eventCaseId_fkey" FOREIGN KEY ("eventCaseId") REFERENCES "EventCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_eventCaseId_fkey" FOREIGN KEY ("eventCaseId") REFERENCES "EventCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptSuggestion" ADD CONSTRAINT "ConceptSuggestion_eventCaseId_fkey" FOREIGN KEY ("eventCaseId") REFERENCES "EventCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_eventCaseId_fkey" FOREIGN KEY ("eventCaseId") REFERENCES "EventCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ExperienceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceVersion" ADD CONSTRAINT "ExperienceVersion_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceBlock" ADD CONSTRAINT "ExperienceBlock_experienceVersionId_fkey" FOREIGN KEY ("experienceVersionId") REFERENCES "ExperienceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_experienceVersionId_fkey" FOREIGN KEY ("experienceVersionId") REFERENCES "ExperienceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ExperienceBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "ExperienceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_assessmentItemId_fkey" FOREIGN KEY ("assessmentItemId") REFERENCES "AssessmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
