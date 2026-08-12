import {
  buildDevelopmentEvents,
  developmentApplications,
  developmentCompanies,
  developmentDocuments,
  developmentJobOffers,
  type SeedApplicationEventType,
  type SeedApplicationStatus,
  type SeedContractType,
  type SeedDocumentType,
} from './development-fixtures';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface SeedUser {
  id: number;
  email: string;
}

interface SeedCompany {
  id: number;
  name: string;
}

interface SeedJobOffer {
  id: number;
  title: string;
}

interface SeedApplication {
  id: number;
}

interface SeedApplicationEvent {
  id: number;
}

interface SeedDocument {
  id: number;
}

export interface SeedStore {
  findUserByEmail: (email: string) => Promise<SeedUser | null>;

  findCompany: (input: {
    name: string;
    userId: number;
  }) => Promise<SeedCompany | null>;

  createCompany: (input: {
    name: string;
    website: string;
    city: string;
    userId: number;
  }) => Promise<SeedCompany>;

  findJobOffer: (input: {
    title: string;
    companyId: number;
  }) => Promise<SeedJobOffer | null>;

  createJobOffer: (input: {
    title: string;
    url: string;
    description: string;
    location: string;
    contractType: SeedContractType;
    salary: string;
    publishedAt: Date;
    companyId: number;
  }) => Promise<SeedJobOffer>;

  findApplication: (input: {
    userId: number;
    jobOfferId: number;
  }) => Promise<SeedApplication | null>;

  createApplication: (input: {
    userId: number;
    jobOfferId: number;
    status: SeedApplicationStatus;
    appliedAt?: Date;
    source?: string;
    notes?: string;
    contactName?: string;
    contactEmail?: string;
    followUpAt?: Date;
    interviewAt?: Date;
    createdAt: Date;
  }) => Promise<SeedApplication>;

  findApplicationEvent: (input: {
    applicationId: number;
    type: SeedApplicationEventType;
    title: string;
    description?: string;
  }) => Promise<SeedApplicationEvent | null>;

  createApplicationEvent: (input: {
    applicationId: number;
    type: SeedApplicationEventType;
    title: string;
    description?: string;
    occurredAt: Date;
  }) => Promise<SeedApplicationEvent>;

  findDocument: (input: {
    userId: number;
    applicationId?: number;
    name: string;
  }) => Promise<SeedDocument | null>;

  createDocument: (input: {
    userId: number;
    applicationId?: number;
    name: string;
    originalName: string;
    mimeType: string;
    size: number;
    path: string;
    type: SeedDocumentType;
    createdAt: Date;
  }) => Promise<SeedDocument>;
}

export interface SeedDevelopmentDataResult {
  user: SeedUser;
  companies: SeedCompany[];
  jobOffers: SeedJobOffer[];
  applications: SeedApplication[];
  applicationEvents: SeedApplicationEvent[];
  documents: SeedDocument[];
}

export function readSeedUserEmail(environment: NodeJS.ProcessEnv): string {
  const value = environment.INITIAL_USER_EMAIL;

  if (!value || value.trim() === '') {
    throw new Error('INITIAL_USER_EMAIL is required to seed development data');
  }

  return value.trim().toLowerCase();
}

function daysAgo(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_IN_MS);
}

function daysFromNow(reference: Date, days: number): Date {
  return new Date(reference.getTime() + days * DAY_IN_MS);
}

function daysAfter(reference: Date, days: number): Date {
  return new Date(reference.getTime() + days * DAY_IN_MS);
}

export async function seedDevelopmentData(
  store: SeedStore,
  email: string,
  referenceDate: Date = new Date(),
): Promise<SeedDevelopmentDataResult> {
  const user = await store.findUserByEmail(email);

  if (!user) {
    throw new Error(
      'The seed user does not exist; run auth:initialize before seeding',
    );
  }

  const companies: SeedCompany[] = [];

  for (const fixture of developmentCompanies) {
    const company =
      (await store.findCompany({
        name: fixture.name,
        userId: user.id,
      })) ??
      (await store.createCompany({
        name: fixture.name,
        website: fixture.website,
        city: fixture.city,
        userId: user.id,
      }));

    companies.push(company);
  }

  const jobOffers: SeedJobOffer[] = [];

  for (const fixture of developmentJobOffers) {
    const company = companies[fixture.companyIndex];

    if (!company) {
      throw new Error(
        `Missing company fixture at index ${fixture.companyIndex}`,
      );
    }

    const jobOffer =
      (await store.findJobOffer({
        title: fixture.title,
        companyId: company.id,
      })) ??
      (await store.createJobOffer({
        title: fixture.title,
        url: fixture.url,
        description: fixture.description,
        location: fixture.location,
        contractType: fixture.contractType,
        salary: fixture.salary,
        publishedAt: daysAgo(referenceDate, fixture.publishedDaysAgo),
        companyId: company.id,
      }));

    jobOffers.push(jobOffer);
  }

  const applications: SeedApplication[] = [];

  for (const fixture of developmentApplications) {
    const jobOffer = jobOffers[fixture.offerIndex];

    if (!jobOffer) {
      throw new Error(
        `Missing job offer fixture at index ${fixture.offerIndex}`,
      );
    }

    const existingApplication = await store.findApplication({
      userId: user.id,
      jobOfferId: jobOffer.id,
    });

    if (existingApplication) {
      applications.push(existingApplication);
      continue;
    }

    const application = await store.createApplication({
      userId: user.id,
      jobOfferId: jobOffer.id,
      status: fixture.status,
      ...(fixture.appliedDaysAgo !== undefined
        ? { appliedAt: daysAgo(referenceDate, fixture.appliedDaysAgo) }
        : {}),
      ...(fixture.source !== undefined ? { source: fixture.source } : {}),
      ...(fixture.notes !== undefined ? { notes: fixture.notes } : {}),
      ...(fixture.contactName !== undefined
        ? { contactName: fixture.contactName }
        : {}),
      ...(fixture.contactEmail !== undefined
        ? { contactEmail: fixture.contactEmail }
        : {}),
      ...(fixture.followUpDaysFromNow !== undefined
        ? {
            followUpAt: daysFromNow(referenceDate, fixture.followUpDaysFromNow),
          }
        : {}),
      ...(fixture.interviewDaysFromNow !== undefined
        ? {
            interviewAt: daysFromNow(
              referenceDate,
              fixture.interviewDaysFromNow,
            ),
          }
        : {}),
      createdAt: daysAgo(referenceDate, fixture.createdDaysAgo),
    });

    applications.push(application);
  }

  const applicationEvents: SeedApplicationEvent[] = [];

  for (let index = 0; index < developmentApplications.length; index += 1) {
    const fixture = developmentApplications[index];
    const application = applications[index];

    if (!fixture || !application) {
      throw new Error(`Missing application fixture at index ${index}`);
    }

    const applicationCreatedAt = daysAgo(referenceDate, fixture.createdDaysAgo);

    for (const eventFixture of buildDevelopmentEvents(fixture)) {
      const existingEvent = await store.findApplicationEvent({
        applicationId: application.id,
        type: eventFixture.type,
        title: eventFixture.title,
      });

      if (existingEvent) {
        applicationEvents.push(existingEvent);
        continue;
      }

      const event = await store.createApplicationEvent({
        applicationId: application.id,
        type: eventFixture.type,
        title: eventFixture.title,
        ...(eventFixture.description !== undefined
          ? { description: eventFixture.description }
          : {}),
        occurredAt: daysAfter(
          applicationCreatedAt,
          eventFixture.daysAfterCreation,
        ),
      });

      applicationEvents.push(event);
    }
  }

  const documents: SeedDocument[] = [];

  for (let index = 0; index < developmentDocuments.length; index += 1) {
    const fixture = developmentDocuments[index];

    if (!fixture) {
      throw new Error(`Missing document fixture at index ${index}`);
    }

    const application =
      fixture.applicationIndex !== undefined
        ? applications[fixture.applicationIndex]
        : undefined;

    if (fixture.applicationIndex !== undefined && !application) {
      throw new Error(
        `Missing application fixture for document at index ${index}`,
      );
    }

    const existingDocument = await store.findDocument({
      userId: user.id,
      ...(application !== undefined ? { applicationId: application.id } : {}),
      name: fixture.name,
    });

    let document: SeedDocument;

    if (existingDocument) {
      document = existingDocument;
    } else {
      document = await store.createDocument({
        userId: user.id,
        ...(application !== undefined ? { applicationId: application.id } : {}),
        name: fixture.name,
        originalName: fixture.originalName,
        mimeType: 'text/plain',
        size: 128,
        path: `uploads/demo/${fixture.originalName}`,
        type: fixture.type,
        createdAt: daysAgo(referenceDate, index % 30),
      });
    }

    documents.push(document);

    if (application !== undefined) {
      const existingDocumentEvent = await store.findApplicationEvent({
        applicationId: application.id,
        type: 'DOCUMENT_ADDED',
        title: 'Document ajouté',
        description: fixture.name,
      });

      if (!existingDocumentEvent) {
        const documentEvent = await store.createApplicationEvent({
          applicationId: application.id,
          type: 'DOCUMENT_ADDED',
          title: 'Document ajouté',
          description: fixture.name,
          occurredAt: daysAgo(referenceDate, index % 30),
        });

        applicationEvents.push(documentEvent);
      } else {
        applicationEvents.push(existingDocumentEvent);
      }
    }
  }

  return {
    user,
    companies,
    jobOffers,
    applications,
    applicationEvents,
    documents,
  };
}
