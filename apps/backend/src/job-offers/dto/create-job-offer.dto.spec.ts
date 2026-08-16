import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateJobOfferDto } from './create-job-offer.dto';

describe('CreateJobOfferDto', () => {
  it('accepts a valid job offer', async () => {
    const dto = plainToInstance(CreateJobOfferDto, {
      title: 'Développeur TypeScript',
      companyId: 1,
      url: 'https://example.com/jobs/1',
      description: 'Backend NestJS',
      location: 'Paris',
      contractType: 'CDI',
      salary: '45k€',
      publishedAt: '2026-08-16T08:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an empty title', async () => {
    const dto = plainToInstance(CreateJobOfferDto, {
      title: '',
      companyId: 1,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'title' })]),
    );
  });

  it.each([
    [{ title: 'Développeur', companyId: 0 }, 'companyId'],
    [
      {
        title: 'Développeur',
        companyId: 1,
        url: 'not-a-url',
      },
      'url',
    ],
    [
      {
        title: 'Développeur',
        companyId: 1,
        contractType: 'INVALID',
      },
      'contractType',
    ],
    [
      {
        title: 'Développeur',
        companyId: 1,
        publishedAt: 'not-a-date',
      },
      'publishedAt',
    ],
  ])('rejects invalid input %p', async (input, property) => {
    const dto = plainToInstance(CreateJobOfferDto, input);
    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property })]),
    );
  });

  it('accepts omitted optional fields', async () => {
    const dto = plainToInstance(CreateJobOfferDto, {
      title: 'Développeur',
      companyId: 1,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
