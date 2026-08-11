import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobOfferDto } from './dto/create-job-offer.dto';
import { UpdateJobOfferDto } from './dto/update-job-offer.dto';

@Injectable()
export class JobOffersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.jobOffer.findMany({
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const jobOffer = await this.prisma.jobOffer.findUnique({
      where: {
        id,
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

  async create(createJobOfferDto: CreateJobOfferDto) {
    const publishedAt = createJobOfferDto.publishedAt
      ? new Date(createJobOfferDto.publishedAt)
      : undefined;

    try {
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

      const company = await this.prisma.company.findUnique({
        where: {
          id: createJobOfferDto.companyId,
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

  async update(id: number, updateJobOfferDto: UpdateJobOfferDto) {
    await this.findOne(id);

    const publishedAt = updateJobOfferDto.publishedAt
      ? new Date(updateJobOfferDto.publishedAt)
      : undefined;

    try {
      return await this.prisma.jobOffer.update({
        where: {
          id,
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
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003' ||
        updateJobOfferDto.companyId === undefined
      ) {
        throw error;
      }

      const company = await this.prisma.company.findUnique({
        where: {
          id: updateJobOfferDto.companyId,
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

  async remove(id: number) {
    await this.findOne(id);

    const application = await this.prisma.application.findFirst({
      where: {
        jobOfferId: id,
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

      const existingApplication = await this.prisma.application.findFirst({
        where: {
          jobOfferId: id,
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
