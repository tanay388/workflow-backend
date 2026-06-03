import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { inferLocalTimeHHMM, localTimeToUtcHHMM, nextRunAt } from '../common/utils/time';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import type { CreateScheduleDto, PatchScheduleDto } from './dto/schedule.dto';
import { Schedule } from './entities/schedule.entity';
import type { ScheduleTiming } from './schedule.types';

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(Schedule) private readonly schedules: Repository<Schedule>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
  ) {}

  async create(tenancy: Tenancy, workflowId: string, userId: string, dto: CreateScheduleDto) {
    const wf = await this.requireWorkflow(tenancy, workflowId);
    this.validateDto(dto);

    const runAtUtc = this.computeRunAtUtc(dto.localTime, dto.timezone, dto.startDate);
    const row = this.schedules.create({
      orgId: wf.orgId,
      workspaceId: wf.workspaceId,
      workflowId: wf.id,
      timezone: dto.timezone,
      runAtUtc,
      repeat: dto.repeat,
      cronExpr: dto.repeat === 'cron' ? dto.cronExpr ?? null : null,
      daysOfWeek: dto.daysOfWeek ?? null,
      startDate: dto.startDate,
      endsOn: dto.endsOn ?? null,
      input: dto.input ?? null,
      status: 'active',
      createdBy: userId,
      updatedBy: userId,
    });
    const saved = await this.schedules.save(row);
    return this.toDto(saved, dto.label);
  }

  async list(tenancy: Tenancy, workflowId: string) {
    await this.requireWorkflow(tenancy, workflowId);
    const rows = await this.schedules.find({
      where: { workflowId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async patch(tenancy: Tenancy, scheduleId: string, userId: string, dto: PatchScheduleDto) {
    const row = await this.findScoped(tenancy, scheduleId);
    if (dto.repeat === 'cron' && !dto.cronExpr && !row.cronExpr) {
      throw new BadRequestException('cronExpr is required for cron repeat');
    }

    const localTime = dto.localTime;
    const timezone = dto.timezone ?? row.timezone;
    const startDate = dto.startDate ?? row.startDate;

    if (localTime || dto.timezone || dto.startDate) {
      const lt =
        localTime ?? inferLocalTimeHHMM(row.runAtUtc, timezone, startDate);
      row.runAtUtc = this.computeRunAtUtc(lt, timezone, startDate);
    }

    if (dto.timezone) row.timezone = dto.timezone;
    if (dto.repeat) row.repeat = dto.repeat;
    if (dto.cronExpr !== undefined) row.cronExpr = dto.cronExpr;
    if (dto.daysOfWeek !== undefined) row.daysOfWeek = dto.daysOfWeek;
    if (dto.startDate) row.startDate = dto.startDate;
    if (dto.endsOn !== undefined) row.endsOn = dto.endsOn;
    if (dto.input !== undefined) row.input = dto.input;
    if (dto.status) row.status = dto.status;
    row.updatedBy = userId;

    const saved = await this.schedules.save(row);
    return this.toDto(saved, dto.label);
  }

  async archive(tenancy: Tenancy, scheduleId: string, userId: string) {
    const row = await this.findScoped(tenancy, scheduleId);
    row.status = 'archived';
    row.deletedAt = new Date();
    row.deletedBy = userId;
    row.updatedBy = userId;
    await this.schedules.save(row);
    return { id: row.id, status: 'archived' };
  }

  async findActiveSchedules(): Promise<Schedule[]> {
    return this.schedules.find({
      where: { status: 'active', deletedAt: IsNull() },
    });
  }

  private validateDto(dto: CreateScheduleDto) {
    if (dto.repeat === 'cron' && !dto.cronExpr) {
      throw new BadRequestException('cronExpr is required for cron repeat');
    }
    if (
      (dto.repeat === 'weekly' || dto.repeat === 'monthly') &&
      (!dto.daysOfWeek || dto.daysOfWeek.length === 0)
    ) {
      throw new BadRequestException('daysOfWeek is required for weekly/monthly repeat');
    }
    if (!DateTime.now().setZone(dto.timezone).isValid) {
      throw new BadRequestException(`Invalid IANA timezone: ${dto.timezone}`);
    }
    try {
      localTimeToUtcHHMM(dto.localTime, dto.timezone, new Date(`${dto.startDate}T12:00:00Z`));
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Invalid timezone or time',
      );
    }
  }

  private computeRunAtUtc(localTime: string, timezone: string, startDate: string): string {
    return localTimeToUtcHHMM(localTime, timezone, new Date(`${startDate}T12:00:00Z`));
  }

  private async requireWorkflow(tenancy: Tenancy, workflowId: string) {
    const wf = await this.workflows.findOne({
      where: {
        id: workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  private async findScoped(tenancy: Tenancy, scheduleId: string) {
    const row = await this.schedules.findOne({
      where: {
        id: scheduleId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Schedule not found');
    return row;
  }

  private toTiming(row: Schedule): ScheduleTiming {
    return {
      timezone: row.timezone,
      runAtUtc: row.runAtUtc,
      repeat: row.repeat,
      cronExpr: row.cronExpr,
      daysOfWeek: row.daysOfWeek,
      startDate: row.startDate,
      endsOn: row.endsOn,
      lastRunAt: row.lastRunAt,
      lastRunKey: row.lastRunKey,
    };
  }

  private toDto(row: Schedule, label?: string) {
    const timing = this.toTiming(row);
    let nextRunAtIso: string | null = null;
    try {
      if (row.status === 'active' && row.repeat === 'none' && row.lastRunKey) {
        nextRunAtIso = null;
      } else if (row.status === 'active') {
        nextRunAtIso = nextRunAt(timing, new Date()).toISOString();
      }
    } catch {
      nextRunAtIso = null;
    }

    return {
      id: row.id,
      workflowId: row.workflowId,
      timezone: row.timezone,
      runAtUtc: row.runAtUtc,
      repeat: row.repeat,
      cronExpr: row.cronExpr,
      daysOfWeek: row.daysOfWeek,
      startDate: row.startDate,
      endsOn: row.endsOn,
      input: row.input,
      status: row.status,
      lastRunAt: row.lastRunAt,
      lastRunKey: row.lastRunKey,
      nextRunAt: nextRunAtIso,
      label: label ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
