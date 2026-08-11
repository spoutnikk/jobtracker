import {
  initializeAuthUser,
  MINIMUM_INITIAL_PASSWORD_LENGTH,
  readAuthInitializationConfig,
  type AuthInitializationConfig,
  type AuthInitializationDependencies,
  type RunInitializationTransaction,
} from './initialize-auth-user';

const environment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/jobtracker',
  INITIAL_USER_EMAIL: '  DEV@JobTracker.Local ',
  INITIAL_USER_PASSWORD: 'a-secure-password',
  INITIAL_USER_FIRST_NAME: ' Dev ',
  INITIAL_USER_LAST_NAME: ' JobTracker ',
};

const config: AuthInitializationConfig = {
  databaseUrl: 'postgresql://user:secret@localhost:5432/jobtracker',
  databaseName: 'jobtracker',
  email: 'dev@jobtracker.local',
  password: 'a-secure-password',
  firstName: 'Dev',
  lastName: 'JobTracker',
};

function createDependencies(existingUsers = 0) {
  const transaction = {
    countUsers: jest.fn().mockResolvedValue(existingUsers),
    createUser: jest.fn().mockResolvedValue({ id: 2 }),
  };
  const runTransaction: RunInitializationTransaction = (operation) =>
    operation(transaction);
  const dependencies: AuthInitializationDependencies = {
    hashPassword: jest.fn().mockResolvedValue('argon2id-hash'),
    runTransaction: jest.fn(runTransaction),
  };

  return { dependencies, transaction };
}

describe('readAuthInitializationConfig', () => {
  it('normalizes the email and names and extracts the database name', () => {
    expect(readAuthInitializationConfig(environment)).toEqual(config);
  });

  it.each([
    'DATABASE_URL',
    'INITIAL_USER_EMAIL',
    'INITIAL_USER_PASSWORD',
    'INITIAL_USER_FIRST_NAME',
    'INITIAL_USER_LAST_NAME',
  ])('rejects when %s is absent', (variableName) => {
    const incompleteEnvironment = { ...environment };
    delete incompleteEnvironment[variableName];

    expect(() => readAuthInitializationConfig(incompleteEnvironment)).toThrow(
      `${variableName} is required`,
    );
  });

  it('rejects an insufficient password', () => {
    expect(() =>
      readAuthInitializationConfig({
        ...environment,
        INITIAL_USER_PASSWORD: 'x'.repeat(MINIMUM_INITIAL_PASSWORD_LENGTH - 1),
      }),
    ).toThrow(
      `INITIAL_USER_PASSWORD must contain at least ${MINIMUM_INITIAL_PASSWORD_LENGTH} characters`,
    );
  });
});

describe('initializeAuthUser', () => {
  it('creates the first user on a fresh database', async () => {
    const { dependencies, transaction } = createDependencies();

    await expect(initializeAuthUser(config, dependencies)).resolves.toEqual({
      userId: 2,
    });
    expect(transaction.createUser).toHaveBeenCalledWith({
      email: 'dev@jobtracker.local',
      firstName: 'Dev',
      lastName: 'JobTracker',
      passwordHash: 'argon2id-hash',
    });
    expect(dependencies.runTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
  });

  it('refuses to create a user when one already exists', async () => {
    const { dependencies, transaction } = createDependencies(1);

    await expect(initializeAuthUser(config, dependencies)).rejects.toThrow(
      'A user already exists; refusing to initialize another authentication user',
    );
    expect(transaction.createUser).not.toHaveBeenCalled();
  });

  it('propagates a serialization error without retry', async () => {
    const transactionError = new Error('Serialization conflict');
    const { dependencies } = createDependencies();
    dependencies.runTransaction = jest.fn().mockRejectedValue(transactionError);

    await expect(initializeAuthUser(config, dependencies)).rejects.toBe(
      transactionError,
    );
    expect(dependencies.runTransaction).toHaveBeenCalledTimes(1);
  });
});
