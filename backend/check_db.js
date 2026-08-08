const { PrismaClient } = require('./generated/prisma/client');
const prisma = new PrismaClient();

async function run() {
  // InspectionProfile table removed (AUDIT_REPORT.md §9.3 Option B / §10 Part 3)
  // — real profiles only ever lived in AppConfig.inspectionProfiles JSON.
  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' }});
  console.log("AppConfig inspectionProfiles field:", appConfig?.inspectionProfiles);
}
run();
