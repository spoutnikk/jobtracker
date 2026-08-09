import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
