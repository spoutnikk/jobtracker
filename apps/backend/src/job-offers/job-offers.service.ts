import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobOfferDto } from './dto/create-job-offer.dto';
import { FindJobOffersQueryDto } from './dto/find-job-offers-query.dto';
import { UpdateJobOfferDto } from './dto/update-job-offer.dto';

@Injectable()
export class JobOffersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: number,
    filters: FindJobOffersQueryDto = new FindJobOffersQueryDto(),
  ) {
    const where: Prisma.JobOfferWhereInput = {
      company: { userId },
      ...(filters.companyId !== undefined && {
        companyId: filters.companyId,
      }),
      ...(filters.contractType !== undefined && {
        contractType: filters.contractType,
      }),
      ...(filters.search !== undefined && {
        OR: [
          {
            title: { contains: filters.search, mode: 'insensitive' },
          },
          {
            company: {
              name: { contains: filters.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
    const orderBy = this.buildJobOfferOrderBy(
      filters.sortBy,
      filters.sortOrder,
    );

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobOffer.findMany({
        where,
        include: { company: true },
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.jobOffer.count({ where }),
    ]);

    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.ceil(total / filters.pageSize),
    };
  }

  private buildJobOfferOrderBy(
    sortBy: FindJobOffersQueryDto['sortBy'],
    sortOrder: FindJobOffersQueryDto['sortOrder'],
  ): Prisma.JobOfferOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'updatedAt':
        return [{ updatedAt: sortOrder }, { id: sortOrder }];
      case 'publishedAt':
        return [{ publishedAt: sortOrder }, { id: sortOrder }];
      case 'title':
        return [{ title: sortOrder }, { id: sortOrder }];
      case 'createdAt':
        return [{ createdAt: sortOrder }, { id: sortOrder }];
    }
  }

  async findOne(userId: number, id: number) {
    const jobOffer = await this.prisma.jobOffer.findFirst({
      where: {
        id,
        company: {
          userId,
        },
      },
      include: {
        company: true,
      },
    });

    if (!jobOffer) {
      throw new NotFoundException(`Job offer with id ${id} not found`);
    }

    return jobOffer;
  }

  async create(userId: number, createJobOfferDto: CreateJobOfferDto) {
    const publishedAt = createJobOfferDto.publishedAt
      ? new Date(createJobOfferDto.publishedAt)
      : undefined;

    try {
      const company = await this.prisma.company.findFirst({
        where: {
          id: createJobOfferDto.companyId,
          userId,
        },
        select: {
          id: true,
        },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with id ${createJobOfferDto.companyId} not found`,
        );
      }

      return await this.prisma.jobOffer.create({
        data: {
          title: createJobOfferDto.title,
          companyId: createJobOfferDto.companyId,
          url: createJobOfferDto.url,
          description: createJobOfferDto.description,
          location: createJobOfferDto.location,
          contractType: createJobOfferDto.contractType,
          salary: createJobOfferDto.salary,
          publishedAt,
        },
        include: {
          company: true,
        },
      });
    } catch (error: unknown) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003'
      ) {
        throw error;
      }

      const company = await this.prisma.company.findFirst({
        where: {
          id: createJobOfferDto.companyId,
          userId,
        },
        select: {
          id: true,
        },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with id ${createJobOfferDto.companyId} not found`,
        );
      }

      throw error;
    }
  }

  async update(
    userId: number,
    id: number,
    updateJobOfferDto: UpdateJobOfferDto,
  ) {
    await this.findOne(userId, id);

    const publishedAt = updateJobOfferDto.publishedAt
      ? new Date(updateJobOfferDto.publishedAt)
      : undefined;

    try {
      if (updateJobOfferDto.companyId !== undefined) {
        const company = await this.prisma.company.findFirst({
          where: {
            id: updateJobOfferDto.companyId,
            userId,
          },
          select: {
            id: true,
          },
        });

        if (!company) {
          throw new NotFoundException(
            `Company with id ${updateJobOfferDto.companyId} not found`,
          );
        }
      }

      return await this.prisma.jobOffer.update({
        where: {
          id,
          company: {
            userId,
          },
        },
        data: {
          title: updateJobOfferDto.title,
          companyId: updateJobOfferDto.companyId,
          url: updateJobOfferDto.url,
          description: updateJobOfferDto.description,
          location: updateJobOfferDto.location,
          contractType: updateJobOfferDto.contractType,
          salary: updateJobOfferDto.salary,
          publishedAt,
        },
        include: {
          company: true,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Job offer with id ${id} not found`);
      }

      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003' ||
        updateJobOfferDto.companyId === undefined
      ) {
        throw error;
      }

      const company = await this.prisma.company.findFirst({
        where: {
          id: updateJobOfferDto.companyId,
          userId,
        },
        select: {
          id: true,
        },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with id ${updateJobOfferDto.companyId} not found`,
        );
      }

      throw error;
    }
  }

  async remove(userId: number, id: number) {
    await this.findOne(userId, id);

    const application = await this.prisma.application.findFirst({
      where: {
        jobOfferId: id,
        jobOffer: {
          company: {
            userId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (application) {
      throw new ConflictException(
        `Job offer with id ${id} cannot be deleted because it has applications`,
      );
    }

    try {
      return await this.prisma.jobOffer.delete({
        where: {
          id,
          company: {
            userId,
          },
        },
        include: {
          company: true,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Job offer with id ${id} not found`);
      }

      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003'
      ) {
        throw error;
      }

      const existingApplication = await this.prisma.application.findFirst({
        where: {
          jobOfferId: id,
          jobOffer: {
            company: {
              userId,
            },
          },
        },
        select: {
          id: true,
        },
      });

      if (existingApplication) {
        throw new ConflictException(
          `Job offer with id ${id} cannot be deleted because it has applications`,
        );
      }

      throw error;
    }
  }
}
