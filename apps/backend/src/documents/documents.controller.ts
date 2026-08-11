import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  Delete,
  Param,
  ParseIntPipe,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { FindDocumentsQueryDto } from './dto/find-documents-query.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}
  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const document = await this.documentsService.findOne(user.id, id);

    return response.download(document.path, document.originalName);
  }
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.findOne(user.id, id);
  }
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.remove(user.id, id);
  }
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads',
        filename: (_request, file, callback) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(
            Math.random() * 1_000_000_000,
          )}`;

          callback(
            null,
            `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`,
          );
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        const allowedMimeTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.oasis.opendocument.text',
          'text/plain',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException('Unsupported file type'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createDocumentDto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.documentsService.create(user.id, createDocumentDto, file);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: FindDocumentsQueryDto,
  ) {
    return this.documentsService.findAll(user.id, filters);
  }
}
