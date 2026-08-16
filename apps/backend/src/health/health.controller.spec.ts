import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  const healthServiceMock = {
    checkDatabase: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: healthServiceMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns an ok health response when the database is available', async () => {
    healthServiceMock.checkDatabase.mockResolvedValue(true);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      service: 'jobtracker-api',
      version: '1.0.0',
      database: 'ok',
    });

    expect(healthServiceMock.checkDatabase).toHaveBeenCalledTimes(1);
  });

  it('returns an error health response when the database is unavailable', async () => {
    healthServiceMock.checkDatabase.mockResolvedValue(false);

    await expect(controller.check()).resolves.toEqual({
      status: 'error',
      service: 'jobtracker-api',
      version: '1.0.0',
      database: 'error',
    });

    expect(healthServiceMock.checkDatabase).toHaveBeenCalledTimes(1);
  });
});
