import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteAccountDto } from './delete-account.dto';

describe('DeleteAccountDto', () => {
  it('accepts a non-empty password', async () => {
    const dto = plainToInstance(DeleteAccountDto, {
      password: 'current-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an empty password', async () => {
    const dto = plainToInstance(DeleteAccountDto, {
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
});
