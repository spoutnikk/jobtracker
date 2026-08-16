import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateJobOfferDto } from './update-job-offer.dto';

describe('UpdateJobOfferDto', () => {
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
