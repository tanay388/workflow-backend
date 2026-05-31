import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Liveness + readiness probes (TRD §15, Phase 01 DoD #3).
 * `/health` is always 200 while the process is up; `/ready` checks DB
 * connectivity and returns 503 when the database is unreachable.
 */
@ApiTags('health')
@Controller()
@Public()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        error: 'database unreachable',
      });
    }
  }
}
