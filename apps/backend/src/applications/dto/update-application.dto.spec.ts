import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateApplicationDto } from './update-application.dto';

describe('UpdateApplicationDto', () => {
  it('accepts an empty update', async () => {
    const dto = plainToInstance(UpdateApplicationDto, {});

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts nullable optional fields', async () => {
    const dto = plainToInstance(UpdateApplicationDto, {
      appliedAt: null,
      source: null,
      notes: null,
      contactName: null,
      contactEmail: null,
      followUpAt: null,
      interviewAt: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);

    expect(dto).toMatchObject({
      appliedAt: null,
      source: null,
      notes: null,
      contactName: null,
      contactEmail: null,
      followUpAt: null,
      interviewAt: null,
    });
  });

  it('accepts valid update values', async () => {
    const dto = plainToInstance(UpdateApplicationDto, {
      jobOfferId: 42,
      status: 'INTERVIEW',
      appliedAt: '2026-08-12T10:00:00.000Z',
      source: 'LinkedIn',
      notes: 'Préparer les questions techniques.',
      contactName: 'Ada Lovelace',
      contactEmail: 'ada@example.com',
      followUpAt: '2026-08-20T10:00:00.000Z',
      interviewAt: '2026-08-21T14:30:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    ['jobOfferId', 0],
    ['jobOfferId', -1],
    ['jobOfferId', 1.5],
    ['status', 'INVALID'],
    ['appliedAt', 'invalid'],
    ['contactEmail', 'invalid-email'],
    ['followUpAt', 'invalid'],
    ['interviewAt', 'invalid'],
  ])('rejects invalid %s', async (property, value) => {
    const dto = plainToInstance(UpdateApplicationDto, {
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
