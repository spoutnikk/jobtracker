import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createApplicationDto: CreateApplicationDto) {
    return this.prisma.application.create({
      data: {
        userId: createApplicationDto.userId,
        jobOfferId: createApplicationDto.jobOfferId,
        status: createApplicationDto.status,
        appliedAt: createApplicationDto.appliedAt
          ? new Date(createApplicationDto.appliedAt)
          : undefined,
        source: createApplicationDto.source,
        notes: createApplicationDto.notes,
        contactName: createApplicationDto.contactName,
        contactEmail: createApplicationDto.contactEmail,
        followUpAt: createApplicationDto.followUpAt
          ? new Date(createApplicationDto.followUpAt)
          : undefined,
        interviewAt: createApplicationDto.interviewAt
          ? new Date(createApplicationDto.interviewAt)
          : undefined,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });
  }

  findAll() {
    return this.prisma.application.findMany({
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const application = await this.prisma.application.findUnique({
      where: {
        id,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(`Application with id ${id} not found`);
    }

    return application;
  }

  async update(id: number, updateApplicationDto: UpdateApplicationDto) {
    await this.findOne(id);

    return this.prisma.application.update({
      where: {
        id,
      },
      data: {
        userId: updateApplicationDto.userId,
        jobOfferId: updateApplicationDto.jobOfferId,
        status: updateApplicationDto.status,
        appliedAt: updateApplicationDto.appliedAt
          ? new Date(updateApplicationDto.appliedAt)
          : undefined,
        source: updateApplicationDto.source,
        notes: updateApplicationDto.notes,
        contactName: updateApplicationDto.contactName,
        contactEmail: updateApplicationDto.contactEmail,
        followUpAt: updateApplicationDto.followUpAt
          ? new Date(updateApplicationDto.followUpAt)
          : undefined,
        interviewAt: updateApplicationDto.interviewAt
          ? new Date(updateApplicationDto.interviewAt)
          : undefined,
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
    });
  }
}
