-- CreateEnum
CREATE TYPE "ApplicationEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'APPLICATION_SENT', 'FOLLOW_UP', 'INTERVIEW', 'DOCUMENT_ADDED', 'NOTE', 'OTHER');

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" SERIAL NOT NULL,
    "type" "ApplicationEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" INTEGER NOT NULL,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_occurredAt_idx" ON "ApplicationEvent"("applicationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
