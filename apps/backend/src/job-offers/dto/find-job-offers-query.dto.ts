import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';
import type { ContractType } from '../../../generated/prisma/enums';
import { ContractType as ContractTypeEnum } from '../../../generated/prisma/enums';

export class FindJobOffersQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId?: number;

  @IsOptional()
  @IsEnum(ContractTypeEnum)
  contractType?: ContractType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(50)
  pageSize: number = 10;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'publishedAt', 'title'])
  sortBy: 'createdAt' | 'updatedAt' | 'publishedAt' | 'title' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
