import { HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const transactionClientMock = {
    application: {
      findFirst: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    applicationEvent: {
      create: jest.fn(),
    },
  };

  const prismaServiceMock = {
    ...transactionClientMock,
    $transaction: jest.fn(
      <T>(
        callback: (tx: typeof transactionClientMock) => Promise<T>,
      ): Promise<T> => callback(transactionClientMock),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    transactionClientMock.application.findFirst.mockResolvedValue({ id: 1 });

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
      path: 'uploads/cv.pdf',
    };

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
      path: 'uploads/cv.pdf',
    };

    prismaServiceMock.document.create.mockRejectedValueOnce(prismaError);
    prismaServiceMock.application.findFirst.mockResolvedValue({ id: 1 });

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
      path: 'uploads/cv.pdf',
    };

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

  it('should return all documents', async () => {
    const documents = [
      {
        id: 1,
        name: 'CV principal',
        type: 'CV',
      },
    ];

    prismaServiceMock.document.findMany.mockResolvedValue(documents);

    await expect(service.findAll()).resolves.toEqual(documents);

    expect(prismaServiceMock.document.findMany).toHaveBeenCalledWith({
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  });
  it('should return one document', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/test.txt',
    };

    prismaServiceMock.document.findUnique.mockResolvedValue(document);

    await expect(service.findOne(1)).resolves.toEqual(document);

    expect(prismaServiceMock.document.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
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
    prismaServiceMock.document.findUnique.mockResolvedValue(null);

    await expect(service.findOne(9999)).rejects.toThrow(
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

    prismaServiceMock.document.findUnique.mockResolvedValue(document);
    prismaServiceMock.document.delete.mockResolvedValue(document);

    await expect(service.remove(1)).resolves.toEqual(document);

    expect(prismaServiceMock.document.delete).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
    });
  });
});
