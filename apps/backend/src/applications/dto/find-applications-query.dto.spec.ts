import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindApplicationsQueryDto } from './find-applications-query.dto';

describe('FindApplicationsQueryDto', () => {
  it('applies pagination and sorting defaults', async () => {
    const dto = plainToInstance(FindApplicationsQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('converts and accepts supported pagination and sorting values', async () => {
    const dto = plainToInstance(FindApplicationsQueryDto, {
      page: '2',
      pageSize: '50',
      sortBy: 'status',
      sortOrder: 'asc',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      pageSize: 50,
      sortBy: 'status',
      sortOrder: 'asc',
    });
  });

  it('accepts ISO date range filters', async () => {
    const dto = plainToInstance(FindApplicationsQueryDto, {
      createdFrom: '2026-08-03T00:00:00.000Z',
      createdTo: '2026-08-10T00:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      createdFrom: '2026-08-03T00:00:00.000Z',
      createdTo: '2026-08-10T00:00:00.000Z',
    });
  });

  it.each([
    [{ createdFrom: 'not-a-date' }, 'createdFrom'],
    [{ createdTo: 'not-a-date' }, 'createdTo'],
  ])('rejects invalid date filter %p', async (input, invalidProperty) => {
    const dto = plainToInstance(FindApplicationsQueryDto, input);
    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: invalidProperty }),
      ]),
    );
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ pageSize: '0' }, 'pageSize'],
    [{ pageSize: '51' }, 'pageSize'],
    [{ sortBy: 'userId' }, 'sortBy'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
  ])('rejects invalid query %p', async (input, invalidProperty) => {
    const dto = plainToInstance(FindApplicationsQueryDto, input);
    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: invalidProperty }),
      ]),
    );
  });
});
