import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationEventDto } from './dto/create-application-event.dto';

@Injectable()
export class ApplicationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createApplicationEventDto: CreateApplicationEventDto) {
    const application = await this.prisma.application.findUnique({
      where: {
        id: createApplicationEventDto.applicationId,
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Application with id ${createApplicationEventDto.applicationId} not found`,
      );
    }

    try {
      return await this.prisma.applicationEvent.create({
        data: {
          applicationId: createApplicationEventDto.applicationId,
          type: createApplicationEventDto.type,
          title: createApplicationEventDto.title,
          description: createApplicationEventDto.description,
          occurredAt: createApplicationEventDto.occurredAt
            ? new Date(createApplicationEventDto.occurredAt)
            : undefined,
        },
      });
    } catch (error: unknown) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003'
      ) {
        throw error;
      }

      const existingApplication = await this.prisma.application.findUnique({
        where: {
          id: createApplicationEventDto.applicationId,
        },
        select: {
          id: true,
        },
      });

      if (!existingApplication) {
        throw new NotFoundException(
          `Application with id ${createApplicationEventDto.applicationId} not found`,
        );
      }

      throw error;
    }
  }

  async findByApplication(applicationId: number) {
    const application = await this.prisma.application.findUnique({
      where: {
        id: applicationId,
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Application with id ${applicationId} not found`,
      );
    }

    return this.prisma.applicationEvent.findMany({
      where: {
        applicationId,
      },
      orderBy: {
        occurredAt: 'asc',
      },
    });
  }
}
