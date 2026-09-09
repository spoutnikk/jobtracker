import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationEventDto } from './dto/create-application-event.dto';
import { FindApplicationEventsQueryDto } from './dto/find-application-events-query.dto';

@Injectable()
export class ApplicationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    createApplicationEventDto: CreateApplicationEventDto,
  ) {
    const application = await this.prisma.application.findFirst({
      where: {
        id: createApplicationEventDto.applicationId,
        userId,
      },
      select: {
        id: true,
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

      const existingApplication = await this.prisma.application.findFirst({
        where: {
          id: createApplicationEventDto.applicationId,
          userId,
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

  async findByApplication(
    userId: number,
    applicationId: number,
    filters: FindApplicationEventsQueryDto = new FindApplicationEventsQueryDto(),
  ) {
    const application = await this.prisma.application.findFirst({
      where: {
        id: applicationId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Application with id ${applicationId} not found`,
      );
    }

    const page = filters.page;
    const pageSize = filters.pageSize;
    const where = {
      applicationId,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.applicationEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.applicationEvent.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
