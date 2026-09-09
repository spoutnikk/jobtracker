import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCompanyDto } from './update-company.dto';

describe('UpdateCompanyDto', () => {
  it.each([['name', 'Acme']])(
    'allows omitted or valid %s but rejects null',
    async (property, value) => {
      const baseline = {};
      await expect(
        validate(plainToInstance(UpdateCompanyDto, baseline)),
      ).resolves.toHaveLength(0);
      await expect(
        validate(
          plainToInstance(UpdateCompanyDto, {
            ...baseline,
            [property]: undefined,
          }),
        ),
      ).resolves.toHaveLength(0);
      await expect(
        validate(
          plainToInstance(UpdateCompanyDto, { ...baseline, [property]: value }),
        ),
      ).resolves.toHaveLength(0);
      const errors = await validate(
        plainToInstance(UpdateCompanyDto, { ...baseline, [property]: null }),
      );
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ property })]),
      );
    },
  );

  it('preserves inherited nullable fields', async () => {
    await expect(
      validate(
        plainToInstance(UpdateCompanyDto, { website: null, city: null }),
      ),
    ).resolves.toHaveLength(0);
  });

  it('accepts an empty update', async () => {
    const dto = plainToInstance(UpdateCompanyDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts a valid partial update', async () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      city: 'Lyon',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('keeps create-company validation rules for supplied fields', async () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      website: 'not-a-url',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'website' }),
      ]),
    );
  });

  it('rejects an explicitly empty supplied name', async () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      name: '',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
  });
});
