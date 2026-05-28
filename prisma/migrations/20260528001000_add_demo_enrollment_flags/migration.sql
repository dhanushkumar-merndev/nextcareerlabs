ALTER TABLE "Enrollment"
ADD COLUMN IF NOT EXISTS "demoStarted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "accessRequested" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Enrollment"
SET "accessRequested" = true
WHERE "status" = 'Pending';
