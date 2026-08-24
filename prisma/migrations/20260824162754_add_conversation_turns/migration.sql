-- CreateTable
CREATE TABLE "conversation_turns" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "preFilterTriggered" BOOLEAN NOT NULL DEFAULT false,
    "preFilterReason" TEXT,
    "postFilterTriggered" BOOLEAN NOT NULL DEFAULT false,
    "postFilterReason" TEXT,
    "transcriptCiphertext" BYTEA,
    "transcriptIv" BYTEA,
    "transcriptAuthTag" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_turns_sessionId_idx" ON "conversation_turns"("sessionId");

-- AddForeignKey
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "screening_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
