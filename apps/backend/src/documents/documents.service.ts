import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { unlink } from 'fs/promises';

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
  async findOne(id: number) {
    const document = await this.prisma.document.findUnique({
      where: {
        id,
      },
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
    });

    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    return document;
  }

  async remove(id: number) {
    const document = await this.findOne(id);

    try {
      await unlink(document.path);
    } catch (error: unknown) {
      const fileSystemError = error as NodeJS.ErrnoException;

      if (fileSystemError.code !== 'ENOENT') {
        throw error;
      }
    }

    return this.prisma.document.delete({
      where: {
        id,
      },
    });
  }
}
