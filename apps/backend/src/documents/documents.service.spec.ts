import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const prismaServiceMock = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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

    await expect(service.create(dto, file)).resolves.toEqual(document);

    expect(prismaServiceMock.document.create).toHaveBeenCalledWith({
      data: {
        name: 'CV principal',
        originalName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        path: 'uploads/cv.pdf',
        type: 'CV',
        applicationId: 1,
      },
    });
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
});
