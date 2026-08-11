import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
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
import { AuthModule } from './auth/auth.module';
import { OriginProtectionMiddleware } from './http/origin-protection.middleware';

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
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginProtectionMiddleware).forRoutes('*');
  }
}
