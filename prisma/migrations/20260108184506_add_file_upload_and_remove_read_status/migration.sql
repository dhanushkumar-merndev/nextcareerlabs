/*
  Warnings:

  - You are about to drop the `UserNotificationState` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserNotificationState" DROP CONSTRAINT "UserNotificationState_notificationId_fkey";

-- DropForeignKey
ALTER TABLE "UserNotificationState" DROP CONSTRAINT "UserNotificationState_userId_fkey";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileUrl" TEXT;

-- DropTable
DROP TABLE "UserNotificationState";
