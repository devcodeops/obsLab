import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (const name of ['svc-alpha', 'svc-beta', 'svc-gamma']) {
    await prisma.serviceChaosConfig.upsert({
      where: { serviceName: name },
      update: {},
      create: { serviceName: name, mode: 'normal' },
    });
  }
  console.log('Seed complete: chaos configs created for svc-alpha, svc-beta, svc-gamma');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
