import {
  readSeedUserEmail,
  seedDevelopmentData,
  type SeedStore,
} from './seed-development-data';

describe('seed development data', () => {
  it('normalizes the required seed user email', () => {
    expect(
      readSeedUserEmail({ INITIAL_USER_EMAIL: '  DEV@JobTracker.Local ' }),
    ).toBe('dev@jobtracker.local');
  });

  it('refuses to seed without an existing user', async () => {
    const store = createStore();

    store.findUserByEmail.mockResolvedValue(null);

    await expect(
      seedDevelopmentData(store, 'dev@jobtracker.local'),
    ).rejects.toThrow(
      'The seed user does not exist; run auth:initialize before seeding',
    );

    expect(store.createCompany).not.toHaveBeenCalled();
    expect(store.createJobOffer).not.toHaveBeenCalled();
    expect(store.createApplication).not.toHaveBeenCalled();
    expect(store.createApplicationEvent).not.toHaveBeenCalled();
    expect(store.createDocument).not.toHaveBeenCalled();
  });

  it('creates development data for the resolved user without exposing credentials', async () => {
    const store = createStore();

    const referenceDate = new Date('2026-08-12T12:00:00.000Z');

    const result = await seedDevelopmentData(
      store,
      'dev@jobtracker.local',
      referenceDate,
    );

    expect(store.findUserByEmail).toHaveBeenCalledWith('dev@jobtracker.local');

    expect(store.createCompany).toHaveBeenCalled();
    expect(store.createCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
      }),
    );

    expect(store.createJobOffer).toHaveBeenCalled();

    expect(store.createApplication).toHaveBeenCalled();
    expect(store.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
      }),
    );

    expect(store.createApplicationEvent).toHaveBeenCalled();

    expect(store.createDocument).toHaveBeenCalled();
    expect(store.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
      }),
    );

    expect(result.user).toEqual({
      id: 7,
      email: 'dev@jobtracker.local',
    });

    expect(result.companies).toHaveLength(12);
    expect(result.jobOffers).toHaveLength(64);
    expect(result.applications).toHaveLength(64);
    expect(result.documents).toHaveLength(24);

    expect(result.applicationEvents.length).toBeGreaterThan(64);
  });

  it('reuses existing development data instead of duplicating it', async () => {
    const store = createStore();

    store.findCompany.mockImplementation(
      (input: { name: string; userId: number }) =>
        Promise.resolve({
          id: Math.abs(hashString(input.name)),
          name: input.name,
        }),
    );

    store.findJobOffer.mockImplementation(
      (input: { title: string; companyId: number }) =>
        Promise.resolve({
          id: Math.abs(hashString(input.title)),
          title: input.title,
        }),
    );

    store.findApplication.mockImplementation(
      (input: { userId: number; jobOfferId: number }) =>
        Promise.resolve({
          id: input.jobOfferId + 10_000,
        }),
    );

    store.findApplicationEvent.mockImplementation(
      (input: {
        applicationId: number;
        type:
          | 'CREATED'
          | 'STATUS_CHANGED'
          | 'APPLICATION_SENT'
          | 'FOLLOW_UP'
          | 'INTERVIEW'
          | 'DOCUMENT_ADDED'
          | 'NOTE'
          | 'OTHER';
        title: string;
        description?: string;
      }) =>
        Promise.resolve({
          id:
            input.applicationId +
            Math.abs(
              hashString(
                `${input.type}:${input.title}:${input.description ?? ''}`,
              ),
            ),
        }),
    );

    store.findDocument.mockImplementation(
      (input: { userId: number; applicationId?: number; name: string }) =>
        Promise.resolve({
          id: Math.abs(hashString(input.name)),
        }),
    );

    const result = await seedDevelopmentData(
      store,
      'dev@jobtracker.local',
      new Date('2026-08-12T12:00:00.000Z'),
    );

    expect(store.createCompany).not.toHaveBeenCalled();
    expect(store.createJobOffer).not.toHaveBeenCalled();
    expect(store.createApplication).not.toHaveBeenCalled();
    expect(store.createApplicationEvent).not.toHaveBeenCalled();
    expect(store.createDocument).not.toHaveBeenCalled();

    expect(result.companies).toHaveLength(12);
    expect(result.jobOffers).toHaveLength(64);
    expect(result.applications).toHaveLength(64);
    expect(result.documents).toHaveLength(24);
  });
});

function createStore(): jest.Mocked<SeedStore> {
  let companyId = 0;
  let jobOfferId = 0;
  let applicationId = 0;
  let applicationEventId = 0;
  let documentId = 0;

  return {
    findUserByEmail: jest.fn().mockResolvedValue({
      id: 7,
      email: 'dev@jobtracker.local',
    }),

    findCompany: jest.fn().mockResolvedValue(null),

    createCompany: jest
      .fn()
      .mockImplementation(
        (input: {
          name: string;
          website: string;
          city: string;
          userId: number;
        }) =>
          Promise.resolve({
            id: ++companyId,
            name: input.name,
          }),
      ),

    findJobOffer: jest.fn().mockResolvedValue(null),

    createJobOffer: jest
      .fn()
      .mockImplementation(
        (input: {
          title: string;
          url: string;
          description: string;
          location: string;
          contractType:
            'CDI' | 'CDD' | 'INTERNSHIP' | 'FREELANCE' | 'TEMPORARY' | 'OTHER';
          salary: string;
          publishedAt: Date;
          companyId: number;
        }) =>
          Promise.resolve({
            id: ++jobOfferId,
            title: input.title,
          }),
      ),

    findApplication: jest.fn().mockResolvedValue(null),

    createApplication: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: ++applicationId,
      }),
    ),

    findApplicationEvent: jest.fn().mockResolvedValue(null),

    createApplicationEvent: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: ++applicationEventId,
      }),
    ),

    findDocument: jest.fn().mockResolvedValue(null),

    createDocument: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: ++documentId,
      }),
    ),
  };
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return hash;
}
