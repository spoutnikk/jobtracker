import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateJobOfferDto } from './update-job-offer.dto';

describe('UpdateJobOfferDto', () => {
  it.each([
    ['title', 'Developer'],
    ['companyId', 1],
  ])('allows omitted or valid %s but rejects null', async (property, value) => {
    const baseline = {};
    await expect(
      validate(plainToInstance(UpdateJobOfferDto, baseline)),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(UpdateJobOfferDto, {
          ...baseline,
          [property]: undefined,
        }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(UpdateJobOfferDto, { ...baseline, [property]: value }),
      ),
    ).resolves.toHaveLength(0);
    const errors = await validate(
      plainToInstance(UpdateJobOfferDto, { ...baseline, [property]: null }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property })]),
    );
  });

  it('preserves inherited nullable fields', async () => {
    await expect(
      validate(
        plainToInstance(UpdateJobOfferDto, {
          url: null,
          description: null,
          location: null,
          contractType: null,
          salary: null,
          publishedAt: null,
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it('accepts an empty update', async () => {
    const dto = plainToInstance(UpdateJobOfferDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts a valid partial update', async () => {
    const dto = plainToInstance(UpdateJobOfferDto, {
      location: 'Lyon',
      contractType: 'CDD',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ companyId: 0 }, 'companyId'],
    [{ url: 'not-a-url' }, 'url'],
    [{ contractType: 'INVALID' }, 'contractType'],
    [{ publishedAt: 'not-a-date' }, 'publishedAt'],
  ])('keeps create-job-offer validation for %p', async (input, property) => {
    const dto = plainToInstance(UpdateJobOfferDto, input);
    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property })]),
    );
  });
});
