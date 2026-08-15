import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  it('normalizes supplied profile fields', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      firstName: '  Ada  ',
      lastName: '  Lovelace ',
      email: '  ADA@Example.com ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });
  });

  it('accepts a partial profile update', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      firstName: 'Grace',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({ firstName: 'Grace' });
  });

  it.each([
    ['firstName', '   '],
    ['lastName', '   '],
    ['email', 'invalid-email'],
  ])('rejects an invalid %s', async (property, value) => {
    const dto = plainToInstance(UpdateProfileDto, {
      [property]: value,
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
});
