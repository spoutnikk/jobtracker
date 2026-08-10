import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApplicationEventsService } from './application-events.service';
import { CreateApplicationEventDto } from './dto/create-application-event.dto';

@Controller('application-events')
export class ApplicationEventsController {
  constructor(
    private readonly applicationEventsService: ApplicationEventsService,
  ) {}

  @Post()
  create(@Body() createApplicationEventDto: CreateApplicationEventDto) {
    return this.applicationEventsService.create(createApplicationEventDto);
  }

  @Get('application/:applicationId')
  findByApplication(
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.applicationEventsService.findByApplication(applicationId);
  }
}
