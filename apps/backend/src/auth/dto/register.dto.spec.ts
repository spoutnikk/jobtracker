import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it('normalizes names and email and accepts a valid password', async () => {
    const dto = plainToInstance(RegisterDto, {
      firstName: '  Ada  ',
      lastName: '  Lovelace ',
      email: '  ADA@Example.com ',
      password: 'correct-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'correct-password',
    });
  });

  it.each([
    ['firstName', '   '],
    ['lastName', '   '],
    ['email', 'invalid-email'],
    ['password', 'too-short'],
  ])('rejects an invalid %s', async (property, value) => {
    const dto = plainToInstance(RegisterDto, {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'correct-password',
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
