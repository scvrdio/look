/*
  Warnings:

  - Made the column `userId` on table `Series` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Series" ALTER COLUMN "userId" SET NOT NULL;
