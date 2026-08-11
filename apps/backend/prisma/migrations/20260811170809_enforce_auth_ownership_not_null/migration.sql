/*
  Warnings:

  - Made the column `userId` on table `Company` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `Document` required. This step will fail if there are existing NULL values in that column.
  - Made the column `passwordHash` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
