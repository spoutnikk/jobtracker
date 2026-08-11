import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { FindCompaniesQueryDto } from './dto/find-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(userId: number, id: number) {
    const company = await this.prisma.company.findFirst({
      where: { id, userId },
      include: {
        jobOffers: true,
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async findAll(
    userId: number,
    filters: FindCompaniesQueryDto = new FindCompaniesQueryDto(),
  ) {
    const page = filters.page;
    const pageSize = filters.pageSize;
    const where: Prisma.CompanyWhereInput = {
      userId,
      ...(filters.search !== undefined && {
        name: {
          contains: filters.search,
          mode: 'insensitive',
        },
      }),
    };
    const orderBy = this.buildCompanyOrderBy(filters.sortBy, filters.sortOrder);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: {
          jobOffers: true,
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private buildCompanyOrderBy(
    sortBy: FindCompaniesQueryDto['sortBy'],
    sortOrder: FindCompaniesQueryDto['sortOrder'],
  ): Prisma.CompanyOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'name':
        return [{ name: sortOrder }, { id: sortOrder }];
      case 'updatedAt':
        return [{ updatedAt: sortOrder }, { id: sortOrder }];
      case 'createdAt':
        return [{ createdAt: sortOrder }, { id: sortOrder }];
    }
  }

  create(userId: number, createCompanyDto: CreateCompanyDto) {
    return this.prisma.company.create({
      data: {
        ...createCompanyDto,
        userId,
      },
      include: {
        jobOffers: true,
      },
    });
  }

  async update(userId: number, id: number, updateCompanyDto: UpdateCompanyDto) {
    await this.findOne(userId, id);

    try {
      return await this.prisma.company.update({
        where: {
          id,
          userId,
        },
        data: updateCompanyDto,
        include: {
          jobOffers: true,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Company with id ${id} not found`);
      }

      throw error;
    }
  }

  async remove(userId: number, id: number) {
    const company = await this.findOne(userId, id);

    if (company.jobOffers.length > 0) {
      throw new ConflictException(
        `Company with id ${id} cannot be deleted because it has job offers`,
      );
    }

    try {
      return await this.prisma.company.delete({
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
        throw new NotFoundException(`Company with id ${id} not found`);
      }

      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003'
      ) {
        throw error;
      }

      const jobOffer = await this.prisma.jobOffer.findFirst({
        where: {
          companyId: id,
          company: {
            userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (jobOffer) {
        throw new ConflictException(
          `Company with id ${id} cannot be deleted because it has job offers`,
        );
      }

      throw error;
    }
  }
}
