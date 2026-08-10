import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    createDocumentDto: CreateDocumentDto,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      path: string;
    },
  ) {
    return this.prisma.document.create({
      data: {
        name: createDocumentDto.name,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        type: createDocumentDto.type,
        applicationId: createDocumentDto.applicationId,
      },
    });
  }

  findAll() {
    return this.prisma.document.findMany({
      include: {
        application: {
          include: {
            jobOffer: {
              include: {
                company: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
