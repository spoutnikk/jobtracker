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
  });

  it('creates the company for the resolved user without exposing credentials', async () => {
    const store = createStore();

    await seedDevelopmentData(store, 'dev@jobtracker.local');

    expect(store.findUserByEmail).toHaveBeenCalledWith('dev@jobtracker.local');
    expect(store.createCompany).toHaveBeenCalledWith({
      name: 'Acme Corp',
      website: 'https://example.com',
      city: 'Paris',
      userId: 7,
    });
  });
});

function createStore() {
  return {
    findUserByEmail: jest
      .fn()
      .mockResolvedValue({ id: 7, email: 'dev@jobtracker.local' }),
    findCompany: jest.fn().mockResolvedValue(null),
    createCompany: jest.fn().mockResolvedValue({ id: 3, name: 'Acme Corp' }),
    findJobOffer: jest.fn().mockResolvedValue(null),
    createJobOffer: jest
      .fn()
      .mockResolvedValue({ id: 4, title: 'Développeur TypeScript' }),
  } satisfies jest.Mocked<SeedStore>;
}
