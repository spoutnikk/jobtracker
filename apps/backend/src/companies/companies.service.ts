import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
