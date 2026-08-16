import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('throws when DATABASE_URL is not defined', () => {
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow('DATABASE_URL is not defined');
  });

  it('creates the service when DATABASE_URL is defined', () => {
    process.env.DATABASE_URL =
      'postgresql://user:password@localhost:5432/jobtracker_test';

    expect(() => new PrismaService()).not.toThrow();
  });

  it('connects when the module initializes', async () => {
    process.env.DATABASE_URL =
      'postgresql://user:password@localhost:5432/jobtracker_test';

    const service = new PrismaService();
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the module is destroyed', async () => {
    process.env.DATABASE_URL =
      'postgresql://user:password@localhost:5432/jobtracker_test';

    const service = new PrismaService();
    const disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
