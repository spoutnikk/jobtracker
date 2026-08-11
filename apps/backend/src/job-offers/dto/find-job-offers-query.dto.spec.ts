import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindJobOffersQueryDto } from './find-job-offers-query.dto';

describe('FindJobOffersQueryDto', () => {
  it('applies defaults and trims search', async () => {
    const dto = plainToInstance(FindJobOffersQueryDto, { search: '  React  ' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      search: 'React',
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('accepts valid filters, pagination, and sorting', async () => {
    const dto = plainToInstance(FindJobOffersQueryDto, {
      companyId: '2',
      contractType: 'CDI',
      page: '2',
      pageSize: '50',
      sortBy: 'title',
      sortOrder: 'asc',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      companyId: 2,
      contractType: 'CDI',
      page: 2,
      pageSize: 50,
      sortBy: 'title',
      sortOrder: 'asc',
    });
  });

  it.each([
    [{ companyId: '0' }, 'companyId'],
    [{ contractType: 'INVALID' }, 'contractType'],
    [{ page: '0' }, 'page'],
    [{ pageSize: '51' }, 'pageSize'],
    [{ sortBy: 'company' }, 'sortBy'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
  ])('rejects invalid query %p', async (input, property) => {
    const errors = await validate(
      plainToInstance(FindJobOffersQueryDto, input),
    );

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property })]),
    );
  });
});
