import prisma from './src/lib/prismaClient';

async function run() {
  const profiles = await prisma.inspectionProfile.findMany();
  console.log("Profiles in DB:", profiles.map((p: any) => p.id));
  const appConfig = await prisma.appConfig.findUnique({ where: { id: '1' }});
  console.log("AppConfig inspectionProfiles field:", appConfig?.inspectionProfiles);
  process.exit(0);
}
run();
