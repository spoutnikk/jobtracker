import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  readSeedUserEmail,
  seedDevelopmentData,
} from '../src/seed/seed-development-data';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const email = readSeedUserEmail(process.env);
  const result = await seedDevelopmentData(
    {
      findUserByEmail: (normalizedEmail) =>
        prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true },
        }),
      findCompany: ({ name, userId }) =>
        prisma.company.findFirst({
          where: { name, userId },
          select: { id: true, name: true },
        }),
      createCompany: (input) =>
        prisma.company.create({
          data: input,
          select: { id: true, name: true },
        }),
      findJobOffer: ({ title, companyId }) =>
        prisma.jobOffer.findFirst({
          where: { title, companyId },
          select: { id: true, title: true },
        }),
      createJobOffer: (input) =>
        prisma.jobOffer.create({
          data: input,
          select: { id: true, title: true },
        }),
    },
    email,
  );

  console.log(`Seeded user id: ${result.user.id}`);
  console.log(`Seeded company id: ${result.company.id}`);
  console.log(`Seeded job offer id: ${result.jobOffer.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
