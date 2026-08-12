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

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed cannot run in production');
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
          where: {
            email: normalizedEmail,
          },
          select: {
            id: true,
            email: true,
          },
        }),

      findCompany: ({ name, userId }) =>
        prisma.company.findFirst({
          where: {
            name,
            userId,
          },
          select: {
            id: true,
            name: true,
          },
        }),

      createCompany: (input) =>
        prisma.company.create({
          data: input,
          select: {
            id: true,
            name: true,
          },
        }),

      findJobOffer: ({ title, companyId }) =>
        prisma.jobOffer.findFirst({
          where: {
            title,
            companyId,
          },
          select: {
            id: true,
            title: true,
          },
        }),

      createJobOffer: (input) =>
        prisma.jobOffer.create({
          data: input,
          select: {
            id: true,
            title: true,
          },
        }),

      findApplication: ({ userId, jobOfferId }) =>
        prisma.application.findFirst({
          where: {
            userId,
            jobOfferId,
          },
          select: {
            id: true,
          },
        }),

      createApplication: (input) =>
        prisma.application.create({
          data: input,
          select: {
            id: true,
          },
        }),

      findApplicationEvent: ({ applicationId, type, title, description }) =>
        prisma.applicationEvent.findFirst({
          where: {
            applicationId,
            type,
            title,
            ...(description !== undefined ? { description } : {}),
          },
          select: {
            id: true,
          },
        }),

      createApplicationEvent: (input) =>
        prisma.applicationEvent.create({
          data: input,
          select: {
            id: true,
          },
        }),

      findDocument: ({ userId, applicationId, name }) =>
        prisma.document.findFirst({
          where: {
            userId,
            name,
            ...(applicationId !== undefined ? { applicationId } : {}),
          },
          select: {
            id: true,
          },
        }),

      createDocument: (input) =>
        prisma.document.create({
          data: input,
          select: {
            id: true,
          },
        }),
    },
    email,
  );

  console.log(`Seeded user id: ${result.user.id}`);
  console.log(`Seeded companies: ${result.companies.length}`);
  console.log(`Seeded job offers: ${result.jobOffers.length}`);
  console.log(`Seeded applications: ${result.applications.length}`);
  console.log(`Seeded application events: ${result.applicationEvents.length}`);
  console.log(`Seeded documents: ${result.documents.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
