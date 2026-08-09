import { Module } from '@nestjs/common';
import { JobOffersService } from './job-offers.service';
import { JobOffersController } from './job-offers.controller';

@Module({
  providers: [JobOffersService],
  controllers: [JobOffersController],
})
export class JobOffersModule {}
