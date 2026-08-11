import {
  ArgumentsHost,
  Catch,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { HttpServer } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  constructor(applicationRef: HttpServer) {
    super(applicationRef);
  }

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    if (exception.code === 'P2002') {
      super.catch(new ConflictException('Resource already exists'), host);
      return;
    }

    if (exception.code === 'P2025') {
      super.catch(new NotFoundException('Resource not found'), host);
      return;
    }

    super.catch(exception, host);
  }
}
