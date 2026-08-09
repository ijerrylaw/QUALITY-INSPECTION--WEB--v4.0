-- DropIndex
DROP INDEX "AQLCategory_profileId_name_key";

-- DropIndex
DROP INDEX "AQLCategory_profileId_idx";

-- DropIndex
DROP INDEX "DefectDefinition_profileId_name_key";

-- DropIndex
DROP INDEX "DefectDefinition_profileId_idx";

-- DropIndex
DROP INDEX "InspectionProfile_name_key";

-- AlterTable
ALTER TABLE "AmendmentLog" ADD COLUMN "recomputedCategoryResults" TEXT;
ALTER TABLE "AmendmentLog" ADD COLUMN "recomputedDimensionResults" TEXT;
ALTER TABLE "AmendmentLog" ADD COLUMN "recomputedFailedDimensions" INTEGER;
ALTER TABLE "AmendmentLog" ADD COLUMN "recomputedVerdict" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AQLCategory";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DefectDefinition";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "InspectionProfile";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PinUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinSalt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT '1',
    "productCodes" TEXT NOT NULL DEFAULT '[]',
    "lines" TEXT NOT NULL DEFAULT '[]',
    "shifts" TEXT NOT NULL DEFAULT '[]',
    "sides" TEXT NOT NULL DEFAULT '[]',
    "sizes" TEXT NOT NULL DEFAULT '[]',
    "sampleSizes" TEXT NOT NULL DEFAULT '[]',
    "productProfileMap" TEXT NOT NULL DEFAULT '{}',
    "companyName" TEXT NOT NULL DEFAULT 'QUALITY INSPECTION',
    "portalTitle" TEXT NOT NULL DEFAULT 'QI Portal v4.0',
    "logoImage" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT 'emerald',
    "skuMaterials" TEXT NOT NULL DEFAULT '[]',
    "skuWeights" TEXT NOT NULL DEFAULT '[]',
    "skuColors" TEXT NOT NULL DEFAULT '[]',
    "skuTreatments" TEXT NOT NULL DEFAULT '[]',
    "skuLengths" TEXT NOT NULL DEFAULT '[]',
    "skuTextures" TEXT NOT NULL DEFAULT '[]',
    "dimensions" TEXT NOT NULL DEFAULT '[]',
    "targetWeight" TEXT NOT NULL DEFAULT '{"target":0,"tolerance":0}',
    "productMatrixConfig" TEXT NOT NULL DEFAULT '{}',
    "aqlCategories" TEXT NOT NULL DEFAULT '[]',
    "defectDefinitions" TEXT NOT NULL DEFAULT '[]',
    "inspectionProfiles" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("accentColor", "companyName", "createdAt", "id", "lines", "logoImage", "portalTitle", "productCodes", "productProfileMap", "sampleSizes", "shifts", "sizes", "skuColors", "skuLengths", "skuMaterials", "skuTextures", "skuTreatments", "skuWeights", "updatedAt") SELECT "accentColor", "companyName", "createdAt", "id", "lines", "logoImage", "portalTitle", "productCodes", "productProfileMap", "sampleSizes", "shifts", "sizes", "skuColors", "skuLengths", "skuMaterials", "skuTextures", "skuTreatments", "skuWeights", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productCode" TEXT NOT NULL,
    "productionDate" TEXT NOT NULL,
    "samplingTime" TEXT NOT NULL,
    "submissionTimestamp" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "dimensions" TEXT NOT NULL,
    "dimensionMins" TEXT NOT NULL,
    "defects" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "aadObjectId" TEXT NOT NULL,
    "userPrincipalName" TEXT NOT NULL,
    "amendmentStatus" TEXT NOT NULL DEFAULT 'UNMODIFIED',
    "totalCarton" INTEGER,
    "gloveWeight" REAL,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Submission" ("aadObjectId", "amendmentStatus", "batchNumber", "createdAt", "defects", "dimensionMins", "dimensions", "gloveWeight", "id", "machineId", "productCode", "productionDate", "profileId", "sampleSize", "samplingTime", "shift", "size", "submissionTimestamp", "totalCarton", "updatedAt", "userPrincipalName", "verdict") SELECT "aadObjectId", "amendmentStatus", "batchNumber", "createdAt", "defects", "dimensionMins", "dimensions", "gloveWeight", "id", "machineId", "productCode", "productionDate", "profileId", "sampleSize", "samplingTime", "shift", "size", "submissionTimestamp", "totalCarton", "updatedAt", "userPrincipalName", "verdict" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
CREATE INDEX "Submission_amendmentStatus_idx" ON "Submission"("amendmentStatus" ASC);
CREATE INDEX "Submission_machineId_shift_idx" ON "Submission"("machineId" ASC, "shift" ASC);
CREATE INDEX "Submission_submissionTimestamp_idx" ON "Submission"("submissionTimestamp" ASC);
CREATE INDEX "Submission_productCode_idx" ON "Submission"("productCode" ASC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PinUser_active_idx" ON "PinUser"("active" ASC);

