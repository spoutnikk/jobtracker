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
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('application-events')
export class ApplicationEventsController {
  constructor(
    private readonly applicationEventsService: ApplicationEventsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createApplicationEventDto: CreateApplicationEventDto,
  ) {
    return this.applicationEventsService.create(
      user.id,
      createApplicationEventDto,
    );
  }

  @Get('application/:applicationId')
  findByApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.applicationEventsService.findByApplication(
      user.id,
      applicationId,
    );
  }
}
