import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCompanyDto } from './create-company.dto';

describe('CreateCompanyDto', () => {
  it('accepts a valid company', async () => {
    const dto = plainToInstance(CreateCompanyDto, {
      name: 'Acme',
      website: 'https://acme.example',
      city: 'Paris',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an empty name', async () => {
    const dto = plainToInstance(CreateCompanyDto, {
      name: '',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
  });

  it('rejects an invalid website', async () => {
    const dto = plainToInstance(CreateCompanyDto, {
      name: 'Acme',
      website: 'not-a-url',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'website' }),
      ]),
    );
  });

  it('accepts omitted optional fields', async () => {
    const dto = plainToInstance(CreateCompanyDto, {
      name: 'Acme',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
