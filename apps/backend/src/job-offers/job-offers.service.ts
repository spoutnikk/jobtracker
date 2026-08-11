import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobOfferDto } from './dto/create-job-offer.dto';

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
}
