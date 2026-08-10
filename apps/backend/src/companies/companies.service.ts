import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: number) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        jobOffers: true,
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  findAll() {
    return this.prisma.company.findMany({
      include: {
        jobOffers: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  create(createCompanyDto: CreateCompanyDto) {
    return this.prisma.company.create({
      data: createCompanyDto,
      include: {
        jobOffers: true,
      },
    });
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto) {
    await this.findOne(id);

    return this.prisma.company.update({
      where: {
        id,
      },
      data: updateCompanyDto,
      include: {
        jobOffers: true,
      },
    });
  }

  async remove(id: number) {
    const company = await this.findOne(id);

    if (company.jobOffers.length > 0) {
      throw new ConflictException(
        `Company with id ${id} cannot be deleted because it has job offers`,
      );
    }

    return this.prisma.company.delete({
      where: {
        id,
      },
    });
  }
}
