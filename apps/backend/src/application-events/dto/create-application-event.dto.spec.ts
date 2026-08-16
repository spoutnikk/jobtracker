import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateApplicationEventDto } from './create-application-event.dto';

describe('CreateApplicationEventDto', () => {
  it('converts applicationId and accepts a valid event', async () => {
    const dto = plainToInstance(CreateApplicationEventDto, {
      applicationId: '4',
      type: 'NOTE',
      title: 'Relance téléphonique',
      description: 'Appeler le recruteur.',
      occurredAt: '2026-08-16T09:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.applicationId).toBe(4);
  });

  it('accepts omitted optional fields', async () => {
    const dto = plainToInstance(CreateApplicationEventDto, {
      applicationId: 4,
      type: 'NOTE',
      title: 'Note',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [
      {
        applicationId: 0,
        type: 'NOTE',
        title: 'Note',
      },
      'applicationId',
    ],
    [
      {
        applicationId: 4,
        type: 'INVALID',
        title: 'Note',
      },
      'type',
    ],
    [
      {
        applicationId: 4,
        type: 'NOTE',
        title: 123,
      },
      'title',
    ],
    [
      {
        applicationId: 4,
        type: 'NOTE',
        title: 'Note',
        description: 123,
      },
      'description',
    ],
    [
      {
        applicationId: 4,
        type: 'NOTE',
        title: 'Note',
        occurredAt: 'invalid',
      },
      'occurredAt',
    ],
  ])('rejects invalid input %p', async (input, property) => {
    const dto = plainToInstance(CreateApplicationEventDto, input);
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
