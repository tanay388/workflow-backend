import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditActorType, AuditLog } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { EmailService } from '../common/email/email.service';
import { Membership, MembershipStatus } from '../iam/entities/membership.entity';
import { OrgStatus, Organization } from '../iam/entities/organization.entity';
import { User } from '../auth/entities/user.entity';
import { UsageAlert, UsageAlertScope } from './entities/usage-alert.entity';
import { UsageDaily } from './entities/usage-daily.entity';
import type { AlertThreshold } from './metering.types';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

@Injectable()
export class AlertSweepService {
  private readonly logger = new Logger(AlertSweepService.name);

  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(UsageDaily) private readonly daily: Repository<UsageDaily>,
    @InjectRepository(UsageAlert) private readonly alerts: Repository<UsageAlert>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async sweep(): Promise<number> {
    const orgs = await this.orgs.find({
      where: { status: OrgStatus.ACTIVE },
    });
    let fired = 0;
    for (const org of orgs) {
      fired += await this.evaluateOrg(org);
    }
    this.lastSweepAt = new Date();
    return fired;
  }

  private lastSweepAt: Date | null = null;

  getLastSweepAt(): Date | null {
    return this.lastSweepAt;
  }

  private async evaluateOrg(org: Organization): Promise<number> {
    const thresholds = this.parseThresholds(org.alertThresholds);
    if (!thresholds.length) return 0;

    const today = todayUtc();
    const monthStart = monthStartUtc();
    let fired = 0;

    const todayRow = await this.daily.findOne({ where: { orgId: org.id, day: today } });
    const todayTokens =
      Number(todayRow?.inputTokens ?? 0) + Number(todayRow?.outputTokens ?? 0);

    const mtdRows = await this.daily
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.input_tokens + d.output_tokens), 0)', 'total')
      .where('d.org_id = :orgId', { orgId: org.id })
      .andWhere('d.day >= :monthStart', { monthStart })
      .getRawOne<{ total: string }>();
    const monthTokens = Number(mtdRows?.total ?? 0);

    for (const threshold of thresholds) {
      if (org.dailyTokenCap) {
        const cap = Number(org.dailyTokenCap);
        if (cap > 0) {
          const pct = (todayTokens / cap) * 100;
          if (pct >= threshold.pct) {
            const sent = await this.fireAlert(
              org,
              today,
              threshold,
              UsageAlertScope.DAILY,
              { used: todayTokens, cap, pct },
            );
            if (sent) fired++;
          }
        }
      }

      if (org.monthlyTokenQuota) {
        const quota = Number(org.monthlyTokenQuota);
        if (quota > 0) {
          const pct = (monthTokens / quota) * 100;
          if (pct >= threshold.pct) {
            const sent = await this.fireAlert(
              org,
              today,
              threshold,
              UsageAlertScope.MONTHLY,
              { used: monthTokens, quota, pct },
            );
            if (sent) fired++;
          }
        }
      }
    }

    return fired;
  }

  private parseThresholds(raw: Record<string, unknown> | null): AlertThreshold[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as AlertThreshold[];
    return [];
  }

  private async fireAlert(
    org: Organization,
    day: string,
    threshold: AlertThreshold,
    scope: UsageAlertScope,
    meta: Record<string, unknown>,
  ): Promise<boolean> {
    const channel = threshold.channel ?? 'email';
    try {
      await this.alerts.save(
        this.alerts.create({
          orgId: org.id,
          day,
          thresholdPct: threshold.pct,
          scope,
          channel,
        }),
      );
    } catch {
      return false;
    }

    await this.audit.record({
      orgId: org.id,
      actorType: AuditActorType.SYSTEM,
      action: 'usage.alert.fired',
      targetType: 'organization',
      targetId: org.id,
      meta: { scope, thresholdPct: threshold.pct, channel, ...meta },
    });

    if (channel === 'email' || channel === 'both') {
      const recipients = await this.adminEmails(org.id);
      for (const to of recipients) {
        await this.email.sendTemplate({
          to,
          subject: `Usage alert: ${threshold.pct}% of ${scope} limit reached`,
          template: 'usage-alert',
          context: {
            orgName: org.name,
            scope,
            thresholdPct: threshold.pct,
            ...meta,
          },
        });
      }
    }

    this.logger.log(
      `Usage alert org=${org.id} scope=${scope} threshold=${threshold.pct}%`,
    );
    return true;
  }

  private async adminEmails(orgId: string): Promise<string[]> {
    const memberships = await this.memberships.find({
      where: { orgId, status: MembershipStatus.ACTIVE },
    });
    const adminRoles = new Set(['owner', 'admin']);
    const adminMembers = memberships.filter((m) => adminRoles.has(m.role) && m.userId);
    const emails: string[] = [];
    for (const m of adminMembers) {
      const user = await this.users.findOne({ where: { id: m.userId! } });
      if (user?.email) emails.push(user.email);
    }
    return emails;
  }
}
