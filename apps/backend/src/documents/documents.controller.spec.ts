import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const documentsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: documentsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
    } as Express.Multer.File;

    const document = {
      id: 1,
      name: 'CV principal',
      originalName: 'cv.pdf',
      mimeType: 'application/pdf',
      size: 1234,
      path: 'uploads/cv.pdf',
      type: 'CV',
      applicationId: 1,
    };

    documentsServiceMock.create.mockResolvedValue(document);

    await expect(controller.create(dto, file)).resolves.toEqual(document);

    expect(documentsServiceMock.create).toHaveBeenCalledWith(dto, file);
  });

  it('should throw BadRequestException when file is missing', () => {
    expect(() =>
      controller.create(
        {
          name: 'Sans fichier',
          type: 'OTHER',
        },
        undefined,
      ),
    ).toThrow(BadRequestException);
  });

  it('should return all documents', async () => {
    const documents = [
      {
        id: 1,
        name: 'CV principal',
        type: 'CV',
      },
    ];

    documentsServiceMock.findAll.mockResolvedValue(documents);

    await expect(controller.findAll()).resolves.toEqual(documents);

    expect(documentsServiceMock.findAll).toHaveBeenCalledTimes(1);
  });
});
