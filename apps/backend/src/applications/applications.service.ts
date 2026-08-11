import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createApplicationDto: CreateApplicationDto) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
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

      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          type: 'CREATED',
          title: 'Candidature créée',
        },
      });

      return application;
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
    return this.prisma.$transaction(async (tx) => {
      const previousApplication = await tx.application.findUnique({
        where: {
          id,
        },
        select: {
          status: true,
          followUpAt: true,
          interviewAt: true,
        },
      });

      if (!previousApplication) {
        throw new NotFoundException(`Application with id ${id} not found`);
      }

      const application = await tx.application.update({
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

      if (
        updateApplicationDto.status !== undefined &&
        updateApplicationDto.status !== previousApplication.status
      ) {
        await tx.applicationEvent.create({
          data: {
            applicationId: id,
            type: 'STATUS_CHANGED',
            title: 'Statut modifié',
            description: `${previousApplication.status} → ${updateApplicationDto.status}`,
          },
        });
      }

      if (
        updateApplicationDto.followUpAt !== undefined &&
        updateApplicationDto.followUpAt !==
          previousApplication.followUpAt?.toISOString()
      ) {
        await tx.applicationEvent.create({
          data: {
            applicationId: id,
            type: 'FOLLOW_UP',
            title: 'Relance planifiée',
            occurredAt: new Date(updateApplicationDto.followUpAt),
          },
        });
      }

      if (
        updateApplicationDto.interviewAt !== undefined &&
        updateApplicationDto.interviewAt !==
          previousApplication.interviewAt?.toISOString()
      ) {
        await tx.applicationEvent.create({
          data: {
            applicationId: id,
            type: 'INTERVIEW',
            title: 'Entretien planifié',
            occurredAt: new Date(updateApplicationDto.interviewAt),
          },
        });
      }

      return application;
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.application.delete({
      where: {
        id,
      },
    });
  }

  findFollowUps() {
    return this.prisma.application.findMany({
      where: {
        followUpAt: {
          gte: new Date(),
        },
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
      orderBy: {
        followUpAt: 'asc',
      },
    });
  }

  findInterviews() {
    return this.prisma.application.findMany({
      where: {
        interviewAt: {
          gte: new Date(),
        },
      },
      include: {
        jobOffer: {
          include: {
            company: true,
          },
        },
      },
      orderBy: {
        interviewAt: 'asc',
      },
    });
  }
}
