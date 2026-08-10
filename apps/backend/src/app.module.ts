import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ApplicationsModule } from './applications/applications.module';
import { JobOffersModule } from './job-offers/job-offers.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentsModule } from './documents/documents.module';
import { ApplicationEventsModule } from './application-events/application-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    PrismaModule,
    ApplicationsModule,
    JobOffersModule,
    CompaniesModule,
    DashboardModule,
    DocumentsModule,
    ApplicationEventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
