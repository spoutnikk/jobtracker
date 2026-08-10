import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

describe('CompaniesController', () => {
  let controller: CompaniesController;

  const companiesServiceMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        {
          provide: CompaniesService,
          useValue: companiesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all companies', async () => {
    const companies = [
      {
        id: 1,
        name: 'Acme Corp',
        website: 'https://example.com',
        city: 'Paris',
        jobOffers: [],
      },
    ];

    companiesServiceMock.findAll.mockResolvedValue(companies);

    await expect(controller.findAll()).resolves.toEqual(companies);

    expect(companiesServiceMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('should return one company', async () => {
    const company = {
      id: 1,
      name: 'Acme Corp',
      jobOffers: [],
    };

    companiesServiceMock.findOne.mockResolvedValue(company);

    await expect(controller.findOne(1)).resolves.toEqual(company);

    expect(companiesServiceMock.findOne).toHaveBeenCalledWith(1);
  });

  it('should create a company', async () => {
    const dto = {
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Lyon',
    };

    const company = {
      id: 2,
      ...dto,
      jobOffers: [],
    };

    companiesServiceMock.create.mockResolvedValue(company);

    await expect(controller.create(dto)).resolves.toEqual(company);

    expect(companiesServiceMock.create).toHaveBeenCalledWith(dto);
  });

  it('should update a company', async () => {
    const dto = {
      city: 'Villeurbanne',
    };

    const company = {
      id: 2,
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Villeurbanne',
      jobOffers: [],
    };

    companiesServiceMock.update.mockResolvedValue(company);

    await expect(controller.update(2, dto)).resolves.toEqual(company);

    expect(companiesServiceMock.update).toHaveBeenCalledWith(2, dto);
  });

  it('should remove a company', async () => {
    const company = {
      id: 2,
      name: 'TechNova',
      website: 'https://technova.example',
      city: 'Villeurbanne',
    };

    companiesServiceMock.remove.mockResolvedValue(company);

    await expect(controller.remove(2)).resolves.toEqual(company);

    expect(companiesServiceMock.remove).toHaveBeenCalledWith(2);
  });
});
