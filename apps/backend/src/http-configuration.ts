import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

export function getCorsConfiguration(environment: NodeJS.ProcessEnv) {
  return {
    origin: environment.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN,
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
