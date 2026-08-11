import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Delete,
  Post,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createApplicationDto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(user.id, createApplicationDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.findAll(user.id);
  }

  @Get('follow-ups')
  findFollowUps(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.findFollowUps(user.id);
  }

  @Get('interviews')
  findInterviews(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.findInterviews(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationsService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateApplicationDto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(user.id, id, updateApplicationDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationsService.remove(user.id, id);
  }
}
