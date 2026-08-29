-- AlterEnum
ALTER TYPE "ConsentPurpose" ADD VALUE 'HUMAN_REVIEW';

-- AlterTable
ALTER TABLE "escalations" ADD COLUMN     "notesAuthTag" BYTEA,
ADD COLUMN     "notesIv" BYTEA;

-- CreateTable
CREATE TABLE "clinician_sessions" (
    "id" UUID NOT NULL,
    "clinicianId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinician_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinician_sessions_tokenHash_key" ON "clinician_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "clinician_sessions_clinicianId_idx" ON "clinician_sessions"("clinicianId");

-- AddForeignKey
ALTER TABLE "clinician_sessions" ADD CONSTRAINT "clinician_sessions_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "clinicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
