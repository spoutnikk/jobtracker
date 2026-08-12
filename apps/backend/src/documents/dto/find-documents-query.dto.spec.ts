import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindDocumentsQueryDto } from './find-documents-query.dto';

describe('FindDocumentsQueryDto', () => {
  it('applies the default pagination and sorting values', async () => {
    const dto = plainToInstance(FindDocumentsQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);

    expect(dto).toMatchObject({
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(dto.search).toBeUndefined();
    expect(dto.type).toBeUndefined();
    expect(dto.applicationId).toBeUndefined();
  });

  it('converts and accepts all supported filters, pagination and sorting', async () => {
    const dto = plainToInstance(FindDocumentsQueryDto, {
      search: 'React',
      type: 'CV',
      applicationId: '42',
      page: '2',
      pageSize: '25',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);

    expect(dto).toMatchObject({
      search: 'React',
      type: 'CV',
      applicationId: 42,
      page: 2,
      pageSize: 25,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it.each(['0', '-1', '1.5', 'invalid'])(
    'rejects invalid application id %s',
    async (applicationId) => {
      const dto = plainToInstance(FindDocumentsQueryDto, { applicationId });
      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'applicationId' }),
        ]),
      );
    },
  );

  it.each(['0', '-1', '1.5', 'invalid'])(
    'rejects invalid page %s',
    async (page) => {
      const dto = plainToInstance(FindDocumentsQueryDto, { page });
      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ property: 'page' })]),
      );
    },
  );

  it.each(['0', '-1', '1.5', '51', 'invalid'])(
    'rejects invalid page size %s',
    async (pageSize) => {
      const dto = plainToInstance(FindDocumentsQueryDto, { pageSize });
      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'pageSize' }),
        ]),
      );
    },
  );

  it.each(['INVALID', 'RESUME', 'PDF'])(
    'rejects invalid document type %s',
    async (type) => {
      const dto = plainToInstance(FindDocumentsQueryDto, { type });
      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ property: 'type' })]),
      );
    },
  );

  it.each(['id', 'originalName', 'invalid'])(
    'rejects unsupported sort field %s',
    async (sortBy) => {
      const dto = plainToInstance(FindDocumentsQueryDto, { sortBy });
      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'sortBy' }),
        ]),
      );
    },
  );

  it.each(['ascending', 'descending', 'invalid'])(
    'rejects invalid sort order %s',
    async (sortOrder) => {
      const dto = plainToInstance(FindDocumentsQueryDto, { sortOrder });
      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'sortOrder' }),
        ]),
      );
    },
  );

  it('rejects a search longer than 200 characters', async () => {
    const dto = plainToInstance(FindDocumentsQueryDto, {
      search: 'a'.repeat(201),
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'search' })]),
    );
  });
});
