import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createApplicationDto: CreateApplicationDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const appliedAt = createApplicationDto.appliedAt
          ? new Date(createApplicationDto.appliedAt)
          : createApplicationDto.status === 'APPLIED'
            ? new Date()
            : undefined;

        const application = await tx.application.create({
          data: {
            userId: createApplicationDto.userId,
            jobOfferId: createApplicationDto.jobOfferId,
            status: createApplicationDto.status,
            appliedAt,
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

        if (createApplicationDto.status === 'APPLIED') {
          await tx.applicationEvent.create({
            data: {
              applicationId: application.id,
              type: 'APPLICATION_SENT',
              title: 'Candidature envoyée',
              occurredAt: appliedAt,
            },
          });
        }

        return application;
      });
    } catch (error: unknown) {
      return this.rethrowApplicationRelationError(
        error,
        createApplicationDto.userId,
        createApplicationDto.jobOfferId,
      );
    }
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previousApplication = await tx.application.findUnique({
          where: {
            id,
          },
          select: {
            status: true,
            appliedAt: true,
            followUpAt: true,
            interviewAt: true,
          },
        });

        if (!previousApplication) {
          throw new NotFoundException(`Application with id ${id} not found`);
        }

        const isTransitioningToApplied =
          updateApplicationDto.status === 'APPLIED' &&
          previousApplication.status !== 'APPLIED';
        const existingApplicationSentEvent = isTransitioningToApplied
          ? await tx.applicationEvent.findFirst({
              where: {
                applicationId: id,
                type: 'APPLICATION_SENT',
              },
              select: {
                id: true,
              },
            })
          : null;
        const isFirstApplicationSent =
          isTransitioningToApplied && existingApplicationSentEvent === null;
        const requestedAppliedAt = updateApplicationDto.appliedAt
          ? new Date(updateApplicationDto.appliedAt)
          : undefined;
        const appliedAt = isFirstApplicationSent
          ? (requestedAppliedAt ?? previousApplication.appliedAt ?? new Date())
          : requestedAppliedAt;
        const followUpAt = updateApplicationDto.followUpAt
          ? new Date(updateApplicationDto.followUpAt)
          : undefined;
        const interviewAt = updateApplicationDto.interviewAt
          ? new Date(updateApplicationDto.interviewAt)
          : undefined;

        const application = await tx.application.update({
          where: {
            id,
          },
          data: {
            userId: updateApplicationDto.userId,
            jobOfferId: updateApplicationDto.jobOfferId,
            status: updateApplicationDto.status,
            appliedAt,
            source: updateApplicationDto.source,
            notes: updateApplicationDto.notes,
            contactName: updateApplicationDto.contactName,
            contactEmail: updateApplicationDto.contactEmail,
            followUpAt,
            interviewAt,
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

        if (isFirstApplicationSent) {
          await tx.applicationEvent.create({
            data: {
              applicationId: id,
              type: 'APPLICATION_SENT',
              title: 'Candidature envoyée',
              occurredAt: appliedAt,
            },
          });
        }

        if (
          followUpAt !== undefined &&
          followUpAt.getTime() !== previousApplication.followUpAt?.getTime()
        ) {
          await tx.applicationEvent.create({
            data: {
              applicationId: id,
              type: 'FOLLOW_UP',
              title: 'Relance planifiée',
              occurredAt: followUpAt,
            },
          });
        }

        if (
          interviewAt !== undefined &&
          interviewAt.getTime() !== previousApplication.interviewAt?.getTime()
        ) {
          await tx.applicationEvent.create({
            data: {
              applicationId: id,
              type: 'INTERVIEW',
              title: 'Entretien planifié',
              occurredAt: interviewAt,
            },
          });
        }

        return application;
      });
    } catch (error: unknown) {
      return this.rethrowApplicationRelationError(
        error,
        updateApplicationDto.userId,
        updateApplicationDto.jobOfferId,
      );
    }
  }

  private async rethrowApplicationRelationError(
    error: unknown,
    userId: number | undefined,
    jobOfferId: number | undefined,
  ): Promise<never> {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2003'
    ) {
      throw error;
    }

    if (userId !== undefined) {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
        },
      });

      if (!user) {
        throw new NotFoundException(`User with id ${userId} not found`);
      }
    }

    if (jobOfferId !== undefined) {
      const jobOffer = await this.prisma.jobOffer.findUnique({
        where: {
          id: jobOfferId,
        },
        select: {
          id: true,
        },
      });

      if (!jobOffer) {
        throw new NotFoundException(
          `Job offer with id ${jobOfferId} not found`,
        );
      }
    }

    throw error;
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
