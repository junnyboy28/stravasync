-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isCommute" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isIndoor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "perceivedExertion" TEXT,
ADD COLUMN     "privateNotes" TEXT,
ALTER COLUMN "stravaId" SET DATA TYPE BIGINT;
