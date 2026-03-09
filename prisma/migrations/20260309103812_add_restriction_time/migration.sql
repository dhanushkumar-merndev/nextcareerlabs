-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "videoEncryptionIV" TEXT,
ADD COLUMN     "videoEncryptionKey" TEXT;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "restrictionTime" DOUBLE PRECISION NOT NULL DEFAULT 0;
