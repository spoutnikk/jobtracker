import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { DocumentType } from '../../../generated/prisma/enums';
import { DocumentType as DocumentTypeEnum } from '../../../generated/prisma/enums';

export class CreateDocumentDto {
  @IsString()
  name!: string;

  @IsEnum(DocumentTypeEnum)
  type!: DocumentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicationId?: number;
}
