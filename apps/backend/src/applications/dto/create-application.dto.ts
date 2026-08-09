import type { ApplicationStatus } from '../../../generated/prisma/enums';

export class CreateApplicationDto {
  userId!: number;
  jobOfferId!: number;
  status?: ApplicationStatus;
  appliedAt?: string;
  source?: string;
  notes?: string;
  contactName?: string;
  contactEmail?: string;
  followUpAt?: string;
  interviewAt?: string;
}
