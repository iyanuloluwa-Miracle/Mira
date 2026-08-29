-- CreateEnum
CREATE TYPE "EvaluationEventType" AS ENUM ('TASK_START', 'TASK_END', 'SCREEN_TRANSITION', 'BACK_NAVIGATION', 'ERROR_ENCOUNTERED', 'ABANDONMENT');

-- CreateTable
CREATE TABLE "metrics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "valueMs" INTEGER NOT NULL,
    "sessionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_sessions" (
    "id" UUID NOT NULL,
    "participantCode" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "evaluation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_events" (
    "id" UUID NOT NULL,
    "evaluationSessionId" UUID NOT NULL,
    "type" "EvaluationEventType" NOT NULL,
    "taskId" TEXT,
    "screen" TEXT,
    "completed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metrics_name_createdAt_idx" ON "metrics"("name", "createdAt");

-- CreateIndex
CREATE INDEX "evaluation_sessions_participantCode_idx" ON "evaluation_sessions"("participantCode");

-- CreateIndex
CREATE INDEX "evaluation_events_evaluationSessionId_idx" ON "evaluation_events"("evaluationSessionId");

-- AddForeignKey
ALTER TABLE "evaluation_events" ADD CONSTRAINT "evaluation_events_evaluationSessionId_fkey" FOREIGN KEY ("evaluationSessionId") REFERENCES "evaluation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
