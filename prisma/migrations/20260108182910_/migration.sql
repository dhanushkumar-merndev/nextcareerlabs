-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_CHAT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "chatGroupId" TEXT,
ADD COLUMN     "threadId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isSupportBanned" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "ChatGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseId" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserThreadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserThreadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserThreadState_userId_idx" ON "UserThreadState"("userId");

-- CreateIndex
CREATE INDEX "UserThreadState_threadId_idx" ON "UserThreadState"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "UserThreadState_userId_threadId_key" ON "UserThreadState"("userId", "threadId");

-- CreateIndex
CREATE INDEX "Notification_threadId_idx" ON "Notification"("threadId");

-- CreateIndex
CREATE INDEX "Notification_chatGroupId_idx" ON "Notification"("chatGroupId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_chatGroupId_fkey" FOREIGN KEY ("chatGroupId") REFERENCES "ChatGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatGroup" ADD CONSTRAINT "ChatGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserThreadState" ADD CONSTRAINT "UserThreadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
