-- Rename Clinic -> Organization (generic tenant); keep S3 key prefix `clinics/` for existing object layout.

ALTER TABLE "Clinic" RENAME TO "Organization";

ALTER TABLE "Organization" RENAME CONSTRAINT "Clinic_pkey" TO "Organization_pkey";

ALTER TABLE "User" DROP CONSTRAINT "User_clinicId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT "Document_clinicId_fkey";

ALTER TABLE "User" RENAME COLUMN "clinicId" TO "organizationId";
ALTER TABLE "Document" RENAME COLUMN "clinicId" TO "organizationId";

ALTER TABLE "User"
  ADD CONSTRAINT "User_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Document_clinicId_status_idx";
CREATE INDEX "Document_organizationId_status_idx" ON "Document"("organizationId", "status");
