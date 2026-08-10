import { Module } from '@nestjs/common';
import { ApplicationEventsService } from './application-events.service';
import { ApplicationEventsController } from './application-events.controller';

@Module({
  providers: [ApplicationEventsService],
  controllers: [ApplicationEventsController],
})
export class ApplicationEventsModule {}
