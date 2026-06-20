-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'approved', 'rejected', 'more_info');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'team_member', 'client');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('high', 'normal');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'paused', 'completed', 'churned');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'in_progress', 'complete', 'blocked', 'extension_requested', 'cancelled');

-- CreateEnum
CREATE TYPE "HistoryTrigger" AS ENUM ('system', 'admin');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('task_assigned', 'task_overdue', 'blocker_raised', 'step_advanced', 'extension_request');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('onboard_application', 'application_review_note', 'add_client', 'send_invite', 'move_client_step', 'raise_blocker', 'request_extension');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingInvite" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentToName" TEXT NOT NULL,
    "sentToEmail" TEXT,
    "sentToWhatsapp" TEXT,
    "createdById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingApplication" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "inviteId" TEXT,
    "fullName" TEXT NOT NULL,
    "brandName" TEXT,
    "email" TEXT,
    "whatsappNumber" TEXT,
    "location" TEXT,
    "niche" TEXT,
    "experience" TEXT,
    "audienceSize" TEXT,
    "revenueGoal" TEXT,
    "eventTopic" TEXT,
    "eventFormat" TEXT,
    "brandColors" TEXT,
    "brandTone" TEXT,
    "notes" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PendingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "teamName" TEXT,
    "whatsappNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "owningTeamName" TEXT NOT NULL,
    "slaDays" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTaskTemplate" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "relativeDueDay" INTEGER NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "StepTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "brandName" TEXT,
    "email" TEXT,
    "whatsappNumber" TEXT,
    "currentStepId" TEXT NOT NULL,
    "stepEnteredAt" TIMESTAMP(3) NOT NULL,
    "dateJoined" TIMESTAMP(3) NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "templateTaskId" TEXT,
    "assignedToId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "blockerNote" TEXT,
    "extensionRequestedDate" TIMESTAMP(3),
    "extensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepHistory" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromStepId" TEXT,
    "toStepId" TEXT NOT NULL,
    "triggeredBy" "HistoryTrigger" NOT NULL,
    "triggeredByUserId" TEXT,
    "reasonNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "sentEmail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDraft" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT,
    "userId" TEXT,
    "kind" "DraftKind" NOT NULL,
    "contextId" TEXT NOT NULL,
    "browserId" TEXT,
    "draftKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "FormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserViewPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserViewPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingInvite_token_key" ON "OnboardingInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PendingApplication_inviteId_key" ON "PendingApplication"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FormDraft_draftKey_key" ON "FormDraft"("draftKey");

-- CreateIndex
CREATE INDEX "FormDraft_kind_contextId_idx" ON "FormDraft"("kind", "contextId");

-- CreateIndex
CREATE INDEX "FormDraft_expiresAt_idx" ON "FormDraft"("expiresAt");

-- CreateIndex
CREATE INDEX "FormDraft_userId_kind_idx" ON "FormDraft"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "UserViewPreference_userId_page_key_key" ON "UserViewPreference"("userId", "page", "key");

-- AddForeignKey
ALTER TABLE "OnboardingInvite" ADD CONSTRAINT "OnboardingInvite_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApplication" ADD CONSTRAINT "PendingApplication_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApplication" ADD CONSTRAINT "PendingApplication_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "OnboardingInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTaskTemplate" ADD CONSTRAINT "StepTaskTemplate_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "Step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepHistory" ADD CONSTRAINT "StepHistory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepHistory" ADD CONSTRAINT "StepHistory_fromStepId_fkey" FOREIGN KEY ("fromStepId") REFERENCES "Step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepHistory" ADD CONSTRAINT "StepHistory_toStepId_fkey" FOREIGN KEY ("toStepId") REFERENCES "Step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepHistory" ADD CONSTRAINT "StepHistory_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDraft" ADD CONSTRAINT "FormDraft_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserViewPreference" ADD CONSTRAINT "UserViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

