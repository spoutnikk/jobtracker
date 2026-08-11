import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
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
}
