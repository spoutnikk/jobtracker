export const MINIMUM_INITIAL_PASSWORD_LENGTH = 12;

export interface AuthInitializationConfig {
  databaseUrl: string;
  databaseName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface InitializationTransaction {
  countUsers(): Promise<number>;
  createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }): Promise<{ id: number }>;
}

export type RunInitializationTransaction = (
  operation: (
    transaction: InitializationTransaction,
  ) => Promise<AuthInitializationResult>,
  options: { isolationLevel: 'Serializable' },
) => Promise<AuthInitializationResult>;

export interface AuthInitializationDependencies {
  hashPassword(password: string): Promise<string>;
  runTransaction: RunInitializationTransaction;
}

export interface AuthInitializationResult {
  userId: number;
}

function requireVariable(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function readAuthInitializationConfig(
  environment: NodeJS.ProcessEnv,
): AuthInitializationConfig {
  const databaseUrl = requireVariable(environment, 'DATABASE_URL');
  const email = requireVariable(environment, 'INITIAL_USER_EMAIL')
    .trim()
    .toLowerCase();
  const password = requireVariable(environment, 'INITIAL_USER_PASSWORD');
  const firstName = requireVariable(
    environment,
    'INITIAL_USER_FIRST_NAME',
  ).trim();
  const lastName = requireVariable(
    environment,
    'INITIAL_USER_LAST_NAME',
  ).trim();

  if (password.length < MINIMUM_INITIAL_PASSWORD_LENGTH) {
    throw new Error(
      `INITIAL_USER_PASSWORD must contain at least ${MINIMUM_INITIAL_PASSWORD_LENGTH} characters`,
    );
  }

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid URL');
  }

  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));

  if (databaseName === '') {
    throw new Error('DATABASE_URL must include a database name');
  }

  return {
    databaseUrl,
    databaseName,
    email,
    password,
    firstName,
    lastName,
  };
}

export async function initializeAuthUser(
  config: AuthInitializationConfig,
  dependencies: AuthInitializationDependencies,
): Promise<AuthInitializationResult> {
  const passwordHash = await dependencies.hashPassword(config.password);

  return dependencies.runTransaction(
    async (transaction) => {
      const existingUsers = await transaction.countUsers();

      if (existingUsers !== 0) {
        throw new Error(
          'A user already exists; refusing to initialize another authentication user',
        );
      }

      const user = await transaction.createUser({
        email: config.email,
        firstName: config.firstName,
        lastName: config.lastName,
        passwordHash,
      });

      return {
        userId: user.id,
      };
    },
    {
      isolationLevel: 'Serializable',
    },
  );
}
