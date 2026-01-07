-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false;
