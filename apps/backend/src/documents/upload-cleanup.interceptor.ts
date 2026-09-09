import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { unlink } from 'node:fs/promises';
import { catchError, type Observable } from 'rxjs';

@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const filePath = context.switchToHttp().getRequest<Request>().file?.path;

    return next.handle().pipe(
      catchError(async (error: unknown) => {
        if (filePath !== undefined) {
          try {
            await unlink(filePath);
          } catch (fileError: unknown) {
            if ((fileError as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw fileError;
            }
          }
        }

        throw error;
      }),
    );
  }
}
