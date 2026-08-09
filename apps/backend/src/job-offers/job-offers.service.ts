import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
