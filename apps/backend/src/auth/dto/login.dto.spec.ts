import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('accepts valid credentials', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'invalid-email',
      password: 'password',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'email',
        }),
      ]),
    );
  });

  it('rejects an empty password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: '',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'password',
        }),
      ]),
    );
  });

  it('rejects missing credentials', async () => {
    const dto = plainToInstance(LoginDto, {});

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'email' }),
        expect.objectContaining({ property: 'password' }),
      ]),
    );
  });
});
