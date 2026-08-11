import { ArgumentsHost, HttpServer, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

describe('PrismaExceptionFilter', () => {
  const response = {};
  const httpServerMock = {
    isHeadersSent: jest.fn().mockReturnValue(false),
    reply: jest.fn(),
    end: jest.fn(),
  };
  const hostMock = {
    getArgByIndex: jest.fn().mockReturnValue(response),
  } as unknown as ArgumentsHost;
  const filter = new PrismaExceptionFilter(
    httpServerMock as unknown as HttpServer,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should translate P2002 into HTTP 409 Conflict', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.9.1',
      },
    );

    filter.catch(exception, hostMock);

    expect(httpServerMock.reply).toHaveBeenCalledWith(
      response,
      {
        message: 'Resource already exists',
        error: 'Conflict',
        statusCode: HttpStatus.CONFLICT,
      },
      HttpStatus.CONFLICT,
    );
  });

  it('should translate P2025 into HTTP 404 Not Found', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      {
        code: 'P2025',
        clientVersion: '7.9.1',
      },
    );

    filter.catch(exception, hostMock);

    expect(httpServerMock.reply).toHaveBeenCalledWith(
      response,
      {
        message: 'Resource not found',
        error: 'Not Found',
        statusCode: HttpStatus.NOT_FOUND,
      },
      HttpStatus.NOT_FOUND,
    );
  });

  it('should leave another known Prisma error as a server error', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    filter.catch(exception, hostMock);

    expect(httpServerMock.reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('should leave a non-Prisma error as a server error', () => {
    const exception = new Error('Unexpected error');

    filter.catch(exception as Prisma.PrismaClientKnownRequestError, hostMock);

    expect(httpServerMock.reply).toHaveBeenCalledWith(
      response,
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
