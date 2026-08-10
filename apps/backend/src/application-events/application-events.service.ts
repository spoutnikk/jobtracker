import { Injectable, NotFoundException } from '@nestjs/common';
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

    return this.prisma.applicationEvent.create({
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
