import { Controller, Get } from '@nestjs/common';
import { Public } from './common/access-key.guard';
import { Collections } from './database/database.module';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Collections) {}

  @Public()
  @Get()
  async health() {
    await this.db.db.command({ ping: 1 });
    return { ok: true, uptimeS: Math.round(process.uptime()), rssMb: Math.round(process.memoryUsage().rss / 1e6) };
  }
}
