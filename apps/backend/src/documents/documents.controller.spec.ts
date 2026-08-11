import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const user = {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  const documentsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
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

    await expect(controller.create(user, dto, file)).resolves.toEqual(document);

    expect(documentsServiceMock.create).toHaveBeenCalledWith(
      user.id,
      dto,
      file,
    );
  });

  it('should throw BadRequestException when file is missing', () => {
    expect(() =>
      controller.create(
        user,
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

    const filters = { applicationId: 42 };

    await expect(controller.findAll(user, filters)).resolves.toEqual(documents);

    expect(documentsServiceMock.findAll).toHaveBeenCalledWith(user.id, filters);
  });

  it('should return one document', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      path: 'uploads/test.txt',
    };

    documentsServiceMock.findOne.mockResolvedValue(document);

    await expect(controller.findOne(user, 1)).resolves.toEqual(document);

    expect(documentsServiceMock.findOne).toHaveBeenCalledWith(user.id, 1);
  });

  it('should remove a document', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
    };

    documentsServiceMock.remove.mockResolvedValue(document);

    await expect(controller.remove(user, 1)).resolves.toEqual(document);

    expect(documentsServiceMock.remove).toHaveBeenCalledWith(user.id, 1);
  });

  it('should download a document', async () => {
    const document = {
      id: 1,
      name: 'Document de test',
      originalName: 'document.txt',
      path: 'uploads/document.txt',
    };

    const response = {
      download: jest.fn(),
    };

    documentsServiceMock.findOne.mockResolvedValue(document);

    await controller.download(
      user,
      1,
      response as unknown as import('express').Response,
    );

    expect(documentsServiceMock.findOne).toHaveBeenCalledWith(user.id, 1);

    expect(response.download).toHaveBeenCalledWith(
      'uploads/document.txt',
      'document.txt',
    );
  });
});
