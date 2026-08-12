import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { unlink } from 'fs/promises';
import { FindDocumentsQueryDto } from './dto/find-documents-query.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    createDocumentDto: CreateDocumentDto,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      path: string;
    },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (createDocumentDto.applicationId !== undefined) {
          const application = await tx.application.findFirst({
            where: {
              id: createDocumentDto.applicationId,
              userId,
            },
            select: {
              id: true,
            },
          });

          if (!application) {
            throw new NotFoundException(
              `Application with id ${createDocumentDto.applicationId} not found`,
            );
          }
        }

        const document = await tx.document.create({
          data: {
            name: createDocumentDto.name,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            type: createDocumentDto.type,
            applicationId: createDocumentDto.applicationId,
            userId,
          },
        });

        if (createDocumentDto.applicationId !== undefined) {
          await tx.applicationEvent.create({
            data: {
              applicationId: createDocumentDto.applicationId,
              type: 'DOCUMENT_ADDED',
              title: 'Document ajouté',
              description: createDocumentDto.name,
            },
          });
        }

        return document;
      });
    } catch (error: unknown) {
      try {
        await unlink(file.path);
      } catch (fileError: unknown) {
        const fileSystemError = fileError as NodeJS.ErrnoException;

        if (fileSystemError.code !== 'ENOENT') {
          throw fileError;
        }
      }

      const applicationId = createDocumentDto.applicationId;

      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2003' ||
        applicationId === undefined
      ) {
        throw error;
      }

      const application = await this.prisma.application.findFirst({
        where: {
          id: applicationId,
          userId,
        },
        select: {
          id: true,
        },
      });

      if (!application) {
        throw new NotFoundException(
          `Application with id ${applicationId} not found`,
        );
      }

      throw error;
    }
  }

  async findAll(
    userId: number,
    filters: FindDocumentsQueryDto = new FindDocumentsQueryDto(),
  ) {
    const search = filters.search?.trim();

    const where: Prisma.DocumentWhereInput = {
      userId,
      ...(filters.applicationId !== undefined
        ? { applicationId: filters.applicationId }
        : {}),
      ...(filters.type !== undefined ? { type: filters.type } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                originalName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                application: {
                  jobOffer: {
                    title: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                application: {
                  jobOffer: {
                    company: {
                      name: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [
      {
        [filters.sortBy]: filters.sortOrder,
      },
      {
        id: filters.sortOrder,
      },
    ];

    const skip = (filters.page - 1) * filters.pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
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
        orderBy,
        skip,
        take: filters.pageSize,
      }),

      this.prisma.document.count({
        where,
      }),
    ]);

    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.pageSize),
    };
  }

  async findOne(userId: number, id: number) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        userId,
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

  async remove(userId: number, id: number) {
    const document = await this.findOne(userId, id);

    try {
      await unlink(document.path);
    } catch (error: unknown) {
      const fileSystemError = error as NodeJS.ErrnoException;

      if (fileSystemError.code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      return await this.prisma.document.delete({
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
        throw new NotFoundException(`Document with id ${id} not found`);
      }

      throw error;
    }
  }
}
