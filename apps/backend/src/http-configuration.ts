import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

export function getFrontendOrigin(environment: NodeJS.ProcessEnv): string {
  const configuredOrigin =
    environment.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN;

  return new URL(configuredOrigin).origin;
}

export function getCorsConfiguration(environment: NodeJS.ProcessEnv) {
  return {
    origin: getFrontendOrigin(environment),
    credentials: true,
  } as const;
}

export function configureHttpApplication(
  app: INestApplication,
  environment: NodeJS.ProcessEnv,
): void {
  app.use(cookieParser());
  app.enableCors(getCorsConfiguration(environment));
}
