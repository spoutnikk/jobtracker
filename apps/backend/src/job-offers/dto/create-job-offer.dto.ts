import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';
import type { ContractType } from '../../../generated/prisma/enums';
import { ContractType as ContractTypeEnum } from '../../../generated/prisma/enums';

export class CreateJobOfferDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsInt()
  @IsPositive()
  companyId!: number;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(ContractTypeEnum)
  contractType?: ContractType;

  @IsOptional()
  @IsString()
  salary?: string;

  @IsOptional()
  @IsISO8601()
  publishedAt?: string;
}
