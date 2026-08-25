/*
  Warnings:

  - Added the required column `readingTimeMinutes` to the `resources` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sourceAttribution` to the `resources` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "readingTimeMinutes" INTEGER NOT NULL,
ADD COLUMN     "sourceAttribution" TEXT NOT NULL;
