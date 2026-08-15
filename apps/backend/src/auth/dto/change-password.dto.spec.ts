import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

describe('ChangePasswordDto', () => {
  it('accepts a valid password change request', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'current-password',
      newPassword: 'new-secure-password',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    ['currentPassword', ''],
    ['newPassword', 'too-short'],
  ])('rejects an invalid %s', async (property, value) => {
    const dto = plainToInstance(ChangePasswordDto, {
      currentPassword: 'current-password',
      newPassword: 'new-secure-password',
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
