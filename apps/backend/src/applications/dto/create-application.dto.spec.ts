import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateApplicationDto } from './create-application.dto';

describe('CreateApplicationDto', () => {
  it('accepts a valid application', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      jobOfferId: 42,
      status: 'APPLIED',
      appliedAt: '2026-08-16T08:00:00.000Z',
      source: 'LinkedIn',
      notes: 'Candidature envoyée.',
      contactName: 'Ada Lovelace',
      contactEmail: 'ada@example.com',
      followUpAt: '2026-08-20T10:00:00.000Z',
      interviewAt: '2026-08-25T14:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts omitted optional fields', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      jobOfferId: 42,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [{ jobOfferId: 0 }, 'jobOfferId'],
    [{ jobOfferId: -1 }, 'jobOfferId'],
    [{ jobOfferId: 1.5 }, 'jobOfferId'],
    [{ jobOfferId: 42, status: 'INVALID' }, 'status'],
    [{ jobOfferId: 42, appliedAt: 'invalid' }, 'appliedAt'],
    [{ jobOfferId: 42, contactEmail: 'invalid-email' }, 'contactEmail'],
    [{ jobOfferId: 42, followUpAt: 'invalid' }, 'followUpAt'],
    [{ jobOfferId: 42, interviewAt: 'invalid' }, 'interviewAt'],
  ])('rejects invalid input %p', async (input, property) => {
    const dto = plainToInstance(CreateApplicationDto, input);
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
