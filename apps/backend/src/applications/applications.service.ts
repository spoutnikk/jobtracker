import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, createApplicationDto: CreateApplicationDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const jobOffer = await tx.jobOffer.findFirst({
          where: {
            id: createApplicationDto.jobOfferId,
            company: {
              userId,
            },
          },
          select: {
            id: true,
          },
        });

        if (!jobOffer) {
          throw new NotFoundException(
            `Job offer with id ${createApplicationDto.jobOfferId} not found`,
          );
        }

        const appliedAt = createApplicationDto.appliedAt
          ? new Date(createApplicationDto.appliedAt)
          : createApplicationDto.status === 'APPLIED'
            ? new Date()
            : undefined;

        const application = await tx.application.create({
          data: {
            userId,
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
        userId,
        createApplicationDto.jobOfferId,
      );
    }
  }

  findAll(userId: number) {
    return this.prisma.application.findMany({
      where: {
        userId,
      },
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

  async findOne(userId: number, id: number) {
    const application = await this.prisma.application.findFirst({
      where: {
        id,
        userId,
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

  async update(
    userId: number,
    id: number,
    updateApplicationDto: UpdateApplicationDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previousApplication = await tx.application.findFirst({
          where: {
            id,
            userId,
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

        if (updateApplicationDto.jobOfferId !== undefined) {
          const jobOffer = await tx.jobOffer.findFirst({
            where: {
              id: updateApplicationDto.jobOfferId,
              company: {
                userId,
              },
            },
            select: {
              id: true,
            },
          });

          if (!jobOffer) {
            throw new NotFoundException(
              `Job offer with id ${updateApplicationDto.jobOfferId} not found`,
            );
          }
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
            userId,
          },
          data: {
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
        userId,
        updateApplicationDto.jobOfferId,
      );
    }
  }

  private async rethrowApplicationRelationError(
    error: unknown,
    userId: number,
    jobOfferId: number | undefined,
  ): Promise<never> {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2003'
    ) {
      throw error;
    }

    if (jobOfferId !== undefined) {
      const jobOffer = await this.prisma.jobOffer.findFirst({
        where: {
          id: jobOfferId,
          company: {
            userId,
          },
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

  async remove(userId: number, id: number) {
    await this.findOne(userId, id);

    try {
      return await this.prisma.application.delete({
        where: {
          id,
          userId,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Application with id ${id} not found`);
      }

      throw error;
    }
  }

  findFollowUps(userId: number) {
    return this.prisma.application.findMany({
      where: {
        userId,
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

  findInterviews(userId: number) {
    return this.prisma.application.findMany({
      where: {
        userId,
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
