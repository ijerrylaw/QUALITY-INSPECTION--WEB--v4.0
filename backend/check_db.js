const { PrismaClient } = require('./generated/prisma/client');
const prisma = new PrismaClient();

async function run() {
  const profiles = await prisma.inspectionProfile.findMany();
  console.log("Profiles in DB:", profiles.map(p => p.id));
  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' }});
  console.log("AppConfig inspectionProfiles field:", appConfig?.inspectionProfiles);
}
run();
