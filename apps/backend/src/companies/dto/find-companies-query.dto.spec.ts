import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindCompaniesQueryDto } from './find-companies-query.dto';

describe('FindCompaniesQueryDto', () => {
  it('applies pagination and sorting defaults', async () => {
    const dto = plainToInstance(FindCompaniesQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('trims search and converts valid pagination values', async () => {
    const dto = plainToInstance(FindCompaniesQueryDto, {
      search: '  Acme  ',
      page: '2',
      pageSize: '50',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      search: 'Acme',
      page: 2,
      pageSize: 50,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('treats an empty trimmed search as absent', async () => {
    const dto = plainToInstance(FindCompaniesQueryDto, { search: '   ' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.search).toBeUndefined();
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ pageSize: '0' }, 'pageSize'],
    [{ pageSize: '51' }, 'pageSize'],
    [{ sortBy: 'userId' }, 'sortBy'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
  ])('rejects invalid query %p', async (input, invalidProperty) => {
    const dto = plainToInstance(FindCompaniesQueryDto, input);
    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: invalidProperty }),
      ]),
    );
  });
});
