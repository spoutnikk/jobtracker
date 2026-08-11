import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindDocumentsQueryDto } from './find-documents-query.dto';

describe('FindDocumentsQueryDto', () => {
  it('accepts an absent application id', async () => {
    const dto = plainToInstance(FindDocumentsQueryDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.applicationId).toBeUndefined();
  });

  it('converts and accepts a positive integer application id', async () => {
    const dto = plainToInstance(FindDocumentsQueryDto, {
      applicationId: '42',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.applicationId).toBe(42);
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
});
