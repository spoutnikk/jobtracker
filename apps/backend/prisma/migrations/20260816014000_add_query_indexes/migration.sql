-- CreateIndex
CREATE INDEX "JobOffer_companyId_idx" ON "JobOffer"("companyId");

-- CreateIndex
CREATE INDEX "Application_userId_createdAt_idx" ON "Application"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_userId_followUpAt_idx" ON "Application"("userId", "followUpAt");

-- CreateIndex
CREATE INDEX "Application_userId_interviewAt_idx" ON "Application"("userId", "interviewAt");

-- CreateIndex
CREATE INDEX "Application_jobOfferId_idx" ON "Application"("jobOfferId");

-- CreateIndex
CREATE INDEX "Document_userId_applicationId_idx" ON "Document"("userId", "applicationId");
