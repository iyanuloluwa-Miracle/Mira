-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuthMode" AS ENUM ('REGISTERED', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('SCREENING', 'RESEARCH_LOGGING');

-- CreateEnum
CREATE TYPE "Instrument" AS ENUM ('PHQ9', 'GAD7', 'COMBINED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('MINIMAL', 'MILD', 'MODERATE', 'HIGH', 'CRISIS');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'CONTACTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClinicianRole" AS ENUM ('CLINICIAN', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "pseudonym" TEXT NOT NULL,
    "authMode" "AuthMode" NOT NULL DEFAULT 'ANONYMOUS',
    "emailHash" TEXT,
    "passwordHash" TEXT,
    "ageBand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "ipHash" TEXT,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "instrument" "Instrument" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "clientLatencyMs" INTEGER,
    "serverLatencyMs" INTEGER,

    CONSTRAINT "screening_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_responses" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "itemCode" TEXT NOT NULL,
    "rawValue" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_text_entries" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "free_text_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_predictions" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "predictedLabel" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "topTokensJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_results" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "phq9Total" INTEGER NOT NULL,
    "gad7Total" INTEGER NOT NULL,
    "phq9Band" TEXT NOT NULL,
    "gad7Band" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "rationaleJson" JSONB NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "tags" TEXT[],
    "minRisk" "RiskLevel" NOT NULL,
    "maxRisk" "RiskLevel" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_recommendations" (
    "id" UUID NOT NULL,
    "triageResultId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "resource_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL,
    "triageResultId" UUID NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'PENDING',
    "clinicianId" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "notesCiphertext" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinicians" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "ClinicianRole" NOT NULL DEFAULT 'CLINICIAN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clinicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_pseudonym_key" ON "users"("pseudonym");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailHash_key" ON "users"("emailHash");

-- CreateIndex
CREATE INDEX "consent_records_userId_idx" ON "consent_records"("userId");

-- CreateIndex
CREATE INDEX "screening_sessions_userId_idx" ON "screening_sessions"("userId");

-- CreateIndex
CREATE INDEX "item_responses_sessionId_idx" ON "item_responses"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "item_responses_sessionId_itemCode_key" ON "item_responses"("sessionId", "itemCode");

-- CreateIndex
CREATE INDEX "free_text_entries_sessionId_idx" ON "free_text_entries"("sessionId");

-- CreateIndex
CREATE INDEX "model_predictions_sessionId_idx" ON "model_predictions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "triage_results_sessionId_key" ON "triage_results"("sessionId");

-- CreateIndex
CREATE INDEX "triage_results_riskLevel_idx" ON "triage_results"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "resources_slug_key" ON "resources"("slug");

-- CreateIndex
CREATE INDEX "resource_recommendations_triageResultId_idx" ON "resource_recommendations"("triageResultId");

-- CreateIndex
CREATE INDEX "resource_recommendations_resourceId_idx" ON "resource_recommendations"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_recommendations_triageResultId_resourceId_key" ON "resource_recommendations"("triageResultId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "escalations_triageResultId_key" ON "escalations"("triageResultId");

-- CreateIndex
CREATE INDEX "escalations_status_idx" ON "escalations"("status");

-- CreateIndex
CREATE INDEX "escalations_clinicianId_idx" ON "escalations"("clinicianId");

-- CreateIndex
CREATE UNIQUE INDEX "clinicians_email_key" ON "clinicians"("email");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actorId_idx" ON "audit_logs"("actorType", "actorId");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_sessions" ADD CONSTRAINT "screening_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_responses" ADD CONSTRAINT "item_responses_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "screening_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_text_entries" ADD CONSTRAINT "free_text_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "screening_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_predictions" ADD CONSTRAINT "model_predictions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "screening_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_results" ADD CONSTRAINT "triage_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "screening_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_recommendations" ADD CONSTRAINT "resource_recommendations_triageResultId_fkey" FOREIGN KEY ("triageResultId") REFERENCES "triage_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_recommendations" ADD CONSTRAINT "resource_recommendations_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_triageResultId_fkey" FOREIGN KEY ("triageResultId") REFERENCES "triage_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "clinicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

