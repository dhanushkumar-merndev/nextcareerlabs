-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "spriteCols" INTEGER,
ADD COLUMN     "spriteHeight" INTEGER,
ADD COLUMN     "spriteInterval" DOUBLE PRECISION,
ADD COLUMN     "spriteKey" TEXT,
ADD COLUMN     "spriteRows" INTEGER,
ADD COLUMN     "spriteWidth" INTEGER;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "actualWatchTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lastWatched" DOUBLE PRECISION NOT NULL DEFAULT 0;
