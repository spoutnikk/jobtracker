export type SeedContractType =
  'CDI' | 'CDD' | 'INTERNSHIP' | 'FREELANCE' | 'TEMPORARY' | 'OTHER';

export type SeedApplicationStatus =
  'DRAFT' | 'APPLIED' | 'FOLLOW_UP' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED';

export type SeedApplicationEventType =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'APPLICATION_SENT'
  | 'FOLLOW_UP'
  | 'INTERVIEW'
  | 'DOCUMENT_ADDED'
  | 'NOTE'
  | 'OTHER';

export type SeedDocumentType = 'CV' | 'COVER_LETTER' | 'JOB_OFFER' | 'OTHER';

export interface DevelopmentCompanyFixture {
  name: string;
  website: string;
  city: string;
}

export interface DevelopmentJobOfferFixture {
  key: string;
  companyIndex: number;
  title: string;
  location: string;
  contractType: SeedContractType;
  salary: string;
  description: string;
  url: string;
  publishedDaysAgo: number;
}

export interface DevelopmentApplicationFixture {
  offerIndex: number;
  status: SeedApplicationStatus;
  createdDaysAgo: number;
  appliedDaysAgo?: number;
  source?: string;
  notes?: string;
  contactName?: string;
  contactEmail?: string;
  followUpDaysFromNow?: number;
  interviewDaysFromNow?: number;
}

export interface DevelopmentEventFixture {
  type: SeedApplicationEventType;
  title: string;
  description?: string;
  daysAfterCreation: number;
}

export interface DevelopmentDocumentFixture {
  applicationIndex?: number;
  name: string;
  originalName: string;
  type: SeedDocumentType;
}

export const developmentCompanies: DevelopmentCompanyFixture[] = [
  {
    name: 'NovaTech',
    website: 'https://example.com/novatech',
    city: 'Paris',
  },
  {
    name: 'PixelForge',
    website: 'https://example.com/pixelforge',
    city: 'Lyon',
  },
  {
    name: 'CloudNest',
    website: 'https://example.com/cloudnest',
    city: 'Nantes',
  },
  {
    name: 'DataPulse',
    website: 'https://example.com/datapulse',
    city: 'Lille',
  },
  {
    name: 'GreenCode',
    website: 'https://example.com/greencode',
    city: 'Bordeaux',
  },
  {
    name: 'HexaSoft',
    website: 'https://example.com/hexasoft',
    city: 'Toulouse',
  },
  {
    name: 'Orbit Systems',
    website: 'https://example.com/orbit',
    city: 'Rennes',
  },
  {
    name: 'Alsace Digital',
    website: 'https://example.com/alsace',
    city: 'Strasbourg',
  },
  {
    name: 'RemoteCraft',
    website: 'https://example.com/remotecraft',
    city: 'Remote',
  },
  {
    name: 'BlueStack',
    website: 'https://example.com/bluestack',
    city: 'Montpellier',
  },
  {
    name: 'CodeHarbor',
    website: 'https://example.com/codeharbor',
    city: 'Marseille',
  },
  {
    name: 'Alpine Labs',
    website: 'https://example.com/alpine',
    city: 'Grenoble',
  },
];

const titles = [
  'Développeur TypeScript',
  'Développeur React',
  'Développeur Full Stack',
  'Développeur Node.js',
  'Ingénieur Backend',
  'Développeur Frontend',
  'Développeur NestJS',
  'Développeur JavaScript',
  'Développeur Web',
  'Ingénieur logiciel',
  'QA Automation Engineer',
  'Développeur API',
  'Consultant TypeScript',
  'Développeur React Senior',
  'Développeur Backend Node.js',
  'Développeur Full Stack React',
];

const contractTypes: SeedContractType[] = [
  'CDI',
  'CDD',
  'INTERNSHIP',
  'FREELANCE',
  'TEMPORARY',
  'OTHER',
];

export const developmentJobOffers: DevelopmentJobOfferFixture[] = Array.from(
  { length: 64 },
  (_, index) => {
    const companyIndex = index % developmentCompanies.length;
    const company = developmentCompanies[companyIndex];
    const baseTitle = titles[index % titles.length];
    const sequence = Math.floor(index / titles.length) + 1;

    return {
      key: `demo-offer-${String(index + 1).padStart(3, '0')}`,
      companyIndex,
      title: `${baseTitle} ${sequence}`,
      location: company.city,
      contractType: contractTypes[index % contractTypes.length],
      salary:
        index % 4 === 0
          ? '45–55 k€'
          : index % 4 === 1
            ? '40–48 k€'
            : index % 4 === 2
              ? '50–60 k€'
              : 'Selon profil',
      description: `Poste fictif de démonstration ${
        index + 1
      } pour tester Jobtracker.`,
      url: `https://example.com/jobs/demo-${String(index + 1).padStart(
        3,
        '0',
      )}`,
      publishedDaysAgo: 3 + (index % 70),
    };
  },
);

const statuses: SeedApplicationStatus[] = [
  'DRAFT',
  'APPLIED',
  'APPLIED',
  'APPLIED',
  'FOLLOW_UP',
  'INTERVIEW',
  'REJECTED',
  'APPLIED',
  'FOLLOW_UP',
  'INTERVIEW',
  'ACCEPTED',
  'REJECTED',
];

const sources = [
  'LinkedIn',
  'Welcome to the Jungle',
  'Apec',
  'Indeed',
  'Site entreprise',
  'Réseau',
  'Candidature spontanée',
];

export const developmentApplications: DevelopmentApplicationFixture[] =
  developmentJobOffers.map((_, index) => {
    const status = statuses[index % statuses.length];
    const createdDaysAgo = index % 70;

    const fixture: DevelopmentApplicationFixture = {
      offerIndex: index,
      status,
      createdDaysAgo,
      source: sources[index % sources.length],
    };

    if (status !== 'DRAFT') {
      fixture.appliedDaysAgo = Math.max(0, createdDaysAgo - 1);
    }

    if (index % 3 === 0) {
      fixture.notes = `Notes de démonstration pour la candidature ${
        index + 1
      }.`;
    }

    if (index % 4 === 0) {
      fixture.contactName = `Contact ${index + 1}`;
      fixture.contactEmail = `contact${index + 1}@example.com`;
    }

    if (status === 'FOLLOW_UP') {
      fixture.followUpDaysFromNow = 1 + (index % 10);
    }

    if (status === 'INTERVIEW') {
      fixture.interviewDaysFromNow = 1 + (index % 10);
    }

    return fixture;
  });

export function buildDevelopmentEvents(
  application: DevelopmentApplicationFixture,
): DevelopmentEventFixture[] {
  const events: DevelopmentEventFixture[] = [
    {
      type: 'CREATED',
      title: 'Candidature créée',
      daysAfterCreation: 0,
    },
  ];

  if (application.status !== 'DRAFT') {
    events.push({
      type: 'APPLICATION_SENT',
      title: 'Candidature envoyée',
      description: application.source,
      daysAfterCreation: 1,
    });
  }

  if (application.status === 'FOLLOW_UP') {
    events.push({
      type: 'FOLLOW_UP',
      title: 'Relance planifiée',
      daysAfterCreation: 2,
    });
  }

  if (application.status === 'INTERVIEW') {
    events.push({
      type: 'INTERVIEW',
      title: 'Entretien planifié',
      daysAfterCreation: 3,
    });
  }

  if (application.status === 'ACCEPTED') {
    events.push({
      type: 'STATUS_CHANGED',
      title: 'Candidature acceptée',
      daysAfterCreation: 4,
    });
  }

  if (application.status === 'REJECTED') {
    events.push({
      type: 'STATUS_CHANGED',
      title: 'Candidature refusée',
      daysAfterCreation: 4,
    });
  }

  if (application.offerIndex % 5 === 0) {
    events.push({
      type: 'NOTE',
      title: 'Note ajoutée',
      description: 'Événement fictif de démonstration.',
      daysAfterCreation: 2,
    });
  }

  return events;
}

export const developmentDocuments: DevelopmentDocumentFixture[] = Array.from(
  { length: 24 },
  (_, index) => ({
    applicationIndex: index < 20 ? index * 2 : undefined,
    name:
      index % 4 === 0
        ? `CV démo ${index + 1}`
        : index % 4 === 1
          ? `Lettre de motivation démo ${index + 1}`
          : index % 4 === 2
            ? `Offre sauvegardée démo ${index + 1}`
            : `Document démo ${index + 1}`,
    originalName: `jobtracker-demo-${String(index + 1).padStart(2, '0')}.txt`,
    type:
      index % 4 === 0
        ? 'CV'
        : index % 4 === 1
          ? 'COVER_LETTER'
          : index % 4 === 2
            ? 'JOB_OFFER'
            : 'OTHER',
  }),
);
