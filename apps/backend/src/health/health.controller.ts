import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'jobtracker-api',
      version: '1.0.0',
    };
  }
}

// import { Controller } from '@nestjs/common';

// @Controller('health')
// export class HealthController {}
