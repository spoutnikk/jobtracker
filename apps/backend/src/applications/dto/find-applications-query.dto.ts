import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsIn,
  Max,
} from 'class-validator';
import type { ApplicationStatus } from '../../../generated/prisma/enums';
import { ApplicationStatus as ApplicationStatusEnum } from '../../../generated/prisma/enums';

export class FindApplicationsQueryDto {
  @IsOptional()
  @IsEnum(ApplicationStatusEnum)
  status?: ApplicationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  jobOfferId?: number;

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
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(50)
  pageSize: number = 10;

  @IsOptional()
  @IsIn([
    'createdAt',
    'updatedAt',
    'appliedAt',
    'followUpAt',
    'interviewAt',
    'status',
  ])
  sortBy:
    | 'createdAt'
    | 'updatedAt'
    | 'appliedAt'
    | 'followUpAt'
    | 'interviewAt'
    | 'status' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
