import { HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unlink } from 'fs/promises';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindDocumentsQueryDto } from './dto/find-documents-query.dto';
import { DocumentsService } from './documents.service';

jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

describe('DocumentsService', () => {
  let service: DocumentsService;

  const failedUploadPath = join(
    tmpdir(),
    'jobtracker-documents-service-tests',
    'missing-cv.pdf',
  );

  function expectSafeFailurePath(path: string) {
    expect(resolve(path).startsWith(`${resolve('uploads')}/`)).toBe(false);
  }

  const transactionClientMock = {
    application: {
      findFirst: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    applicationEvent: {
      create: jest.fn(),
    },
  };

  type TransactionCallback<T> = (
    tx: typeof transactionClientMock,
  ) => Promise<T>;

  const prismaServiceMock = {
    ...transactionClientMock,
    $transaction: jest.fn(
      <T>(
        input: TransactionCallback<T> | Promise<unknown>[],
      ): Promise<T | unknown[]> => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }

        return input(transactionClientMock);
      },
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    jest.mocked(unlink).mockResolvedValue(undefined);

    transactionClientMock.application.findFirst.mockResolvedValue({
      id: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a document', async () => {
    const dto = {
      name: 'CV principal',
      type: 'CV' as const,
      applicationId: 1,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: 'uploads/cv.pdf',
    };

    const document = {
      id: 1,
      ...dto,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
    };

    prismaServiceMock.document.create.mockResolvedValue(document);

    await expect(service.create(7, dto, file)).resolves.toEqual(document);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        userId: 7,
      },
      select: {
        id: true,
      },
    });

    expect(prismaServiceMock.document.create).toHaveBeenCalledWith({
      data: {
        name: 'CV principal',
        originalName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        path: 'uploads/cv.pdf',
        type: 'CV',
        applicationId: 1,
        userId: 7,
      },
    });

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 1,
        type: 'DOCUMENT_ADDED',
        title: 'Document ajouté',
        description: 'CV principal',
      },
    });
  });

  it('should throw NotFoundException when creating for an application owned by another user', async () => {
    const dto = {
      name: 'CV principal',
      type: 'CV' as const,
      applicationId: 9999,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: failedUploadPath,
    };

    expectSafeFailurePath(file.path);

    prismaServiceMock.application.findFirst.mockResolvedValueOnce(null);

    const error: unknown = await service
      .create(7, dto, file)
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.message).toBe('Application with id 9999 not found');

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: 9999,
        userId: 7,
      },
      select: {
        id: true,
      },
    });

    expect(prismaServiceMock.document.create).not.toHaveBeenCalled();
    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should propagate P2003 when the application exists', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    const dto = {
      name: 'CV principal',
      type: 'CV' as const,
      applicationId: 1,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: failedUploadPath,
    };

    expectSafeFailurePath(file.path);

    prismaServiceMock.document.create.mockRejectedValueOnce(prismaError);
    prismaServiceMock.application.findFirst.mockResolvedValue({
      id: 1,
    });

    await expect(service.create(7, dto, file)).rejects.toBe(prismaError);

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        userId: 7,
      },
      select: {
        id: true,
      },
    });
  });

  it('should propagate P2003 without checking an application when applicationId is missing', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
      },
    );

    const dto = {
      name: 'CV générique',
      type: 'CV' as const,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: failedUploadPath,
    };

    expectSafeFailurePath(file.path);

    prismaServiceMock.document.create.mockRejectedValueOnce(prismaError);

    await expect(service.create(7, dto, file)).rejects.toBe(prismaError);

    expect(prismaServiceMock.application.findFirst).not.toHaveBeenCalled();
  });

  it('should propagate the application event error when creating a document', async () => {
    const transactionError = new Error('Document event creation failed');

    const dto = {
      name: 'CV principal',
      type: 'CV' as const,
      applicationId: 1,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: failedUploadPath,
    };

    const document = {
      id: 1,
      ...dto,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
    };

    expectSafeFailurePath(file.path);

    prismaServiceMock.document.create.mockResolvedValue(document);
    prismaServiceMock.applicationEvent.create.mockRejectedValueOnce(
      transactionError,
    );

    await expect(service.create(7, dto, file)).rejects.toBe(transactionError);

    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);

    expect(prismaServiceMock.document.create).toHaveBeenCalledWith({
      data: {
        name: 'CV principal',
        originalName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        path: failedUploadPath,
        type: 'CV',
        applicationId: 1,
        userId: 7,
      },
    });

    expect(prismaServiceMock.applicationEvent.create).toHaveBeenCalledWith({
      data: {
        applicationId: 1,
        type: 'DOCUMENT_ADDED',
        title: 'Document ajouté',
        description: 'CV principal',
      },
    });

    expect(prismaServiceMock.application.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should create a document without an application event when applicationId is missing', async () => {
    const dto = {
      name: 'CV générique',
      type: 'CV' as const,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: 'uploads/cv.pdf',
    };

    const document = {
      id: 1,
      ...dto,
      applicationId: null,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
    };

    prismaServiceMock.document.create.mockResolvedValue(document);

    await expect(service.create(7, dto, file)).resolves.toEqual(document);

    expect(prismaServiceMock.document.create).toHaveBeenCalledWith({
      data: {
        name: 'CV générique',
        originalName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        path: 'uploads/cv.pdf',
        type: 'CV',
        applicationId: undefined,
        userId: 7,
      },
    });

    expect(prismaServiceMock.applicationEvent.create).not.toHaveBeenCalled();
  });

  it('should return paginated documents with default sorting', async () => {
    const documents = [
      {
        id: 1,
        name: 'CV principal',
        type: 'CV',
      },
    ];

    prismaServiceMock.document.findMany.mockResolvedValue(documents);
    prismaServiceMock.document.count.mockResolvedValue(1);

    await expect(service.findAll(7)).resolves.toEqual({
      items: documents,
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    expect(prismaServiceMock.document.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
      },
      include: {
        application: {
          include: {
            jobOffer: {
              include: {
                company: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });

    expect(prismaServiceMock.document.count).toHaveBeenCalledWith({
      where: {
        userId: 7,
      },
    });

    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should combine search, type and application filters without weakening ownership', async () => {
    const filters = createFilters({
      search: '  react  ',
      type: 'CV',
      applicationId: 42,
      page: 2,
      pageSize: 25,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    const documents = [
      {
        id: 1,
        name: 'CV React',
        type: 'CV',
      },
    ];

    prismaServiceMock.document.findMany.mockResolvedValue(documents);
    prismaServiceMock.document.count.mockResolvedValue(26);

    await expect(service.findAll(7, filters)).resolves.toEqual({
      items: documents,
      page: 2,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    });

    const expectedWhere: Prisma.DocumentWhereInput = {
      userId: 7,
      applicationId: 42,
      type: 'CV',
      OR: [
        {
          name: {
            contains: 'react',
            mode: 'insensitive',
          },
        },
        {
          originalName: {
            contains: 'react',
            mode: 'insensitive',
          },
        },
        {
          application: {
            jobOffer: {
              title: {
                contains: 'react',
                mode: 'insensitive',
              },
            },
          },
        },
        {
          application: {
            jobOffer: {
              company: {
                name: {
                  contains: 'react',
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      ],
    };

    expect(prismaServiceMock.document.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      include: {
        application: {
          include: {
            jobOffer: {
              include: {
                company: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 25,
      take: 25,
    });

    expect(prismaServiceMock.document.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });

    expect(prismaServiceMock.application.findFirst).not.toHaveBeenCalled();
  });

  it('should share the exact same where object between findMany and count', async () => {
    const filters = createFilters({
      search: 'typescript',
      type: 'COVER_LETTER',
      applicationId: 99,
    });

    let findManyWhere: Prisma.DocumentWhereInput | undefined;
    let countWhere: Prisma.DocumentWhereInput | undefined;

    prismaServiceMock.document.findMany.mockImplementation(
      (args: Prisma.DocumentFindManyArgs) => {
        findManyWhere = args.where;
        return Promise.resolve([]);
      },
    );

    prismaServiceMock.document.count.mockImplementation(
      (args: Prisma.DocumentCountArgs) => {
        countWhere = args.where;
        return Promise.resolve(0);
      },
    );

    await service.findAll(7, filters);

    expect(findManyWhere).toBeDefined();
    expect(countWhere).toBeDefined();
    expect(findManyWhere).toBe(countWhere);
  });

  it('should ignore an empty trimmed search', async () => {
    const filters = createFilters({
      search: '   ',
    });

    prismaServiceMock.document.findMany.mockResolvedValue([]);
    prismaServiceMock.document.count.mockResolvedValue(0);

    await service.findAll(7, filters);

    expect(prismaServiceMock.document.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
      },
      include: {
        application: {
          include: {
            jobOffer: {
              include: {
                company: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });
  });

  it('should return zero total pages when no documents match', async () => {
    prismaServiceMock.document.findMany.mockResolvedValue([]);
    prismaServiceMock.document.count.mockResolvedValue(0);

    await expect(service.findAll(7)).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it('should return one document', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/test.txt',
    };

    prismaServiceMock.document.findFirst.mockResolvedValue(document);

    await expect(service.findOne(7, 1)).resolves.toEqual(document);

    expect(prismaServiceMock.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        userId: 7,
      },
      include: {
        application: {
          include: {
            jobOffer: {
              include: {
                company: true,
              },
            },
          },
        },
      },
    });
  });

  it('should throw NotFoundException when document does not exist', async () => {
    prismaServiceMock.document.findFirst.mockResolvedValue(null);

    await expect(service.findOne(7, 9999)).rejects.toThrow(
      'Document with id 9999 not found',
    );
  });

  it('should remove a document even when physical file is already missing', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/file-that-does-not-exist.txt',
      application: null,
    };

    prismaServiceMock.document.findFirst.mockResolvedValue(document);
    prismaServiceMock.document.delete.mockResolvedValue(document);

    await expect(service.remove(7, 1)).resolves.toEqual(document);

    expect(prismaServiceMock.document.delete).toHaveBeenCalledWith({
      where: {
        id: 1,
        userId: 7,
      },
    });
  });

  it('should not delete a document owned by another user', async () => {
    prismaServiceMock.document.findFirst.mockResolvedValue(null);

    await expect(service.remove(7, 9999)).rejects.toThrow(
      'Document with id 9999 not found',
    );

    expect(prismaServiceMock.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 9999,
        userId: 7,
      },
      include: {
        application: {
          include: {
            jobOffer: {
              include: {
                company: true,
              },
            },
          },
        },
      },
    });

    expect(prismaServiceMock.document.delete).not.toHaveBeenCalled();
  });

  it('should keep the physical file when database deletion fails', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/document.pdf',
      application: null,
    };
    const databaseError = new Error('Database deletion failed');

    prismaServiceMock.document.findFirst.mockResolvedValue(document);
    prismaServiceMock.document.delete.mockRejectedValueOnce(databaseError);

    await expect(service.remove(7, 1)).rejects.toBe(databaseError);

    expect(unlink).not.toHaveBeenCalled();
  });

  it('should delete the database record before the physical file', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/document.pdf',
      application: null,
    };

    prismaServiceMock.document.findFirst.mockResolvedValue(document);
    prismaServiceMock.document.delete.mockResolvedValue(document);

    await expect(service.remove(7, 1)).resolves.toEqual(document);

    expect(prismaServiceMock.document.delete).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledWith(document.path);
    expect(
      prismaServiceMock.document.delete.mock.invocationCallOrder[0],
    ).toBeLessThan(jest.mocked(unlink).mock.invocationCallOrder[0]);
  });

  it('should translate P2025 during removal to the same NotFoundException', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/file-that-does-not-exist.txt',
      application: null,
    };

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      {
        code: 'P2025',
        clientVersion: '7.9.1',
      },
    );

    prismaServiceMock.document.findFirst.mockResolvedValue(document);
    prismaServiceMock.document.delete.mockRejectedValueOnce(prismaError);

    await expect(service.remove(7, 1)).rejects.toThrow(
      'Document with id 1 not found',
    );
  });

  it('should ignore ENOENT when cleaning up a failed document creation', async () => {
    const databaseError = new Error('Document creation failed');

    const dto = {
      name: 'CV principal',
      type: 'CV' as const,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: failedUploadPath,
    };

    prismaServiceMock.document.create.mockRejectedValueOnce(databaseError);

    const fileError = Object.assign(new Error('File not found'), {
      code: 'ENOENT',
    });

    jest.mocked(unlink).mockRejectedValueOnce(fileError);

    await expect(service.create(7, dto, file)).rejects.toBe(databaseError);

    expect(unlink).toHaveBeenCalledWith(file.path);
  });

  it('should propagate a filesystem error when cleanup after creation fails', async () => {
    const databaseError = new Error('Document creation failed');

    const dto = {
      name: 'CV principal',
      type: 'CV' as const,
    };

    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1234,
      path: failedUploadPath,
    };

    prismaServiceMock.document.create.mockRejectedValueOnce(databaseError);

    const fileError = Object.assign(new Error('Permission denied'), {
      code: 'EACCES',
    });

    jest.mocked(unlink).mockRejectedValueOnce(fileError);

    await expect(service.create(7, dto, file)).rejects.toBe(fileError);

    expect(unlink).toHaveBeenCalledWith(file.path);
  });

  it('should propagate a filesystem error when physical deletion fails', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/document.pdf',
      application: null,
    };

    prismaServiceMock.document.findFirst.mockResolvedValue(document);
    prismaServiceMock.document.delete.mockResolvedValue(document);

    const fileError = Object.assign(new Error('Permission denied'), {
      code: 'EACCES',
    });

    jest.mocked(unlink).mockRejectedValueOnce(fileError);

    await expect(service.remove(7, 1)).rejects.toBe(fileError);

    expect(prismaServiceMock.document.delete).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledWith(document.path);
  });
});

function createFilters(
  overrides: Partial<FindDocumentsQueryDto>,
): FindDocumentsQueryDto {
  return Object.assign(new FindDocumentsQueryDto(), overrides);
}
