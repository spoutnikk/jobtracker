export interface SeedStore {
  findUserByEmail(email: string): Promise<{ id: number; email: string } | null>;
  findCompany(input: {
    name: string;
    userId: number;
  }): Promise<{ id: number; name: string } | null>;
  createCompany(input: {
    name: string;
    website: string;
    city: string;
    userId: number;
  }): Promise<{ id: number; name: string }>;
  findJobOffer(input: {
    title: string;
    companyId: number;
  }): Promise<{ id: number; title: string } | null>;
  createJobOffer(input: {
    title: string;
    location: string;
    contractType: 'CDI';
    companyId: number;
  }): Promise<{ id: number; title: string }>;
}

export function readSeedUserEmail(environment: NodeJS.ProcessEnv): string {
  const value = environment.INITIAL_USER_EMAIL;

  if (!value || value.trim() === '') {
    throw new Error('INITIAL_USER_EMAIL is required to seed development data');
  }

  return value.trim().toLowerCase();
}

export async function seedDevelopmentData(store: SeedStore, email: string) {
  const user = await store.findUserByEmail(email);

  if (!user) {
    throw new Error(
      'The seed user does not exist; run auth:initialize before seeding',
    );
  }

  const company =
    (await store.findCompany({ name: 'Acme Corp', userId: user.id })) ??
    (await store.createCompany({
      name: 'Acme Corp',
      website: 'https://example.com',
      city: 'Paris',
      userId: user.id,
    }));

  const jobOffer =
    (await store.findJobOffer({
      title: 'Développeur TypeScript',
      companyId: company.id,
    })) ??
    (await store.createJobOffer({
      title: 'Développeur TypeScript',
      location: 'Paris',
      contractType: 'CDI',
      companyId: company.id,
    }));

  return {
    user,
    company,
    jobOffer,
  };
}
