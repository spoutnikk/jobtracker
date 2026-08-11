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
