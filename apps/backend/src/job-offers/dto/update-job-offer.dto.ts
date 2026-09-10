import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsISO8601, IsOptional } from 'class-validator';
import { CreateJobOfferDto } from './create-job-offer.dto';

export class UpdateJobOfferDto extends PartialType(
  OmitType(CreateJobOfferDto, ['publishedAt'] as const),
  { skipNullProperties: false },
) {
  @IsOptional()
  @IsISO8601()
  publishedAt?: string | null;
}
