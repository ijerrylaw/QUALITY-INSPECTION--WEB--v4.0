-- CreateTable
CREATE TABLE "Submission" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Submission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InspectionProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AmendmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "originalValues" TEXT NOT NULL,
    "newValues" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "supervisorNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AmendmentLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InspectionProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AQLCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aqlLevel" TEXT NOT NULL,
    "evaluationMode" TEXT NOT NULL DEFAULT '',
    "profileId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AQLCategory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InspectionProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DefectDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "defaultClass" TEXT NOT NULL,
    "currentClass" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DefectDefinition_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InspectionProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT '1',
    "productCodes" TEXT NOT NULL DEFAULT '[]',
    "lines" TEXT NOT NULL DEFAULT '[]',
    "shifts" TEXT NOT NULL DEFAULT '[]',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Submission_productCode_idx" ON "Submission"("productCode");

-- CreateIndex
CREATE INDEX "Submission_submissionTimestamp_idx" ON "Submission"("submissionTimestamp");

-- CreateIndex
CREATE INDEX "Submission_machineId_shift_idx" ON "Submission"("machineId", "shift");

-- CreateIndex
CREATE INDEX "Submission_amendmentStatus_idx" ON "Submission"("amendmentStatus");

-- CreateIndex
CREATE INDEX "AmendmentLog_submissionId_idx" ON "AmendmentLog"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionProfile_name_key" ON "InspectionProfile"("name");

-- CreateIndex
CREATE INDEX "AQLCategory_profileId_idx" ON "AQLCategory"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "AQLCategory_profileId_name_key" ON "AQLCategory"("profileId", "name");

-- CreateIndex
CREATE INDEX "DefectDefinition_profileId_idx" ON "DefectDefinition"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "DefectDefinition_profileId_name_key" ON "DefectDefinition"("profileId", "name");
