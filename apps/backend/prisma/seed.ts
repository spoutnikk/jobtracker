import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: {
      email: 'dev@jobtracker.local',
    },
    update: {},
    create: {
      email: 'dev@jobtracker.local',
      firstName: 'Dev',
      lastName: 'JobTracker',
    },
  });

  const company =
    (await prisma.company.findFirst({
      where: {
        name: 'Acme Corp',
      },
    })) ??
    (await prisma.company.create({
      data: {
        name: 'Acme Corp',
        website: 'https://example.com',
        city: 'Paris',
      },
    }));

  const jobOffer =
    (await prisma.jobOffer.findFirst({
      where: {
        title: 'Développeur TypeScript',
        companyId: company.id,
      },
    })) ??
    (await prisma.jobOffer.create({
      data: {
        title: 'Développeur TypeScript',
        location: 'Paris',
        contractType: 'CDI',
        companyId: company.id,
      },
    }));

  console.log('Seeded user:', user);
  console.log('Seeded company:', company);
  console.log('Seeded job offer:', jobOffer);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
