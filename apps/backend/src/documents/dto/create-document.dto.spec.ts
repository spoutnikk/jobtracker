import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto } from './create-document.dto';

describe('CreateDocumentDto', () => {
  it('converts applicationId and accepts a valid document', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      name: 'CV principal',
      type: 'CV',
      applicationId: '42',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);

    expect(dto).toMatchObject({
      name: 'CV principal',
      type: 'CV',
      applicationId: 42,
    });
  });

  it('accepts an omitted applicationId', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      name: 'CV générique',
      type: 'CV',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.applicationId).toBeUndefined();
  });

  it.each([
    [{ type: 'INVALID' }, 'type'],
    [{ applicationId: '0' }, 'applicationId'],
    [{ applicationId: '-1' }, 'applicationId'],
    [{ applicationId: '1.5' }, 'applicationId'],
  ])('rejects invalid input %p', async (input, property) => {
    const dto = plainToInstance(CreateDocumentDto, {
      name: 'Document',
      type: 'CV',
      ...input,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property,
        }),
      ]),
    );
  });

  it('rejects missing required fields', async () => {
    const dto = plainToInstance(CreateDocumentDto, {});

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'name' }),
        expect.objectContaining({ property: 'type' }),
      ]),
    );
  });
});
