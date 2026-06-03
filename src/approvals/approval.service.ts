import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ActionTokenService } from './action-token.service';
import { ApprovalRequest, type ApprovalStatus } from './entities/approval-request.entity';
import { WaitService } from './wait.service';
import type { WaitOutcome } from './wait.types';

export interface ApprovalContext {
  workflowId: string;
  workflowName: string;
  runId: string;
  nodeId: string;
  nodeLabel: string;
  title: string;
  summary?: string;
  payload?: unknown;
}

@Injectable()
export class ApprovalService {
  constructor(
    @InjectRepository(ApprovalRequest) private readonly approvals: Repository<ApprovalRequest>,
    private readonly actionTokens: ActionTokenService,
    private readonly wait: WaitService,
  ) {}

  async listInbox(tenancy: Tenancy, status?: ApprovalStatus) {
    const qb = this.approvals
      .createQueryBuilder('a')
      .where('a.org_id = :orgId', { orgId: tenancy.orgId })
      .andWhere('a.workspace_id = :workspaceId', { workspaceId: tenancy.workspaceId })
      .andWhere('a.deleted_at IS NULL');

    if (status) qb.andWhere('a.status = :status', { status });
    else qb.andWhere("a.status = 'pending'");

    qb.orderBy('a.created_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r) => this.toDto(r));
  }

  async decideById(
    tenancy: Tenancy,
    approvalId: string,
    decision: 'approve' | 'reject',
    userId: string,
  ) {
    const row = await this.approvals.findOne({
      where: { id: approvalId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!row) throw new NotFoundException('Approval not found');
    return this.decideRow(row, decision, userId);
  }

  async decideByToken(token: string, decision: 'approve' | 'reject') {
    const verified = this.actionTokens.verify(token);
    if (!verified) throw new BadRequestException('Invalid action token');

    const row = await this.approvals.findOne({ where: { actionToken: token } });
    if (!row) throw new NotFoundException('Approval not found');

    if (row.status !== 'pending') {
      return {
        status: row.status,
        decision: row.status,
        alreadyDecided: true,
        context: row.context,
      };
    }

    if (row.tokenExpiresAt.getTime() < Date.now()) {
      await this.markExpired(row);
      return {
        status: 'expired' as const,
        decision: 'expired' as const,
        alreadyDecided: true,
        context: row.context,
      };
    }

    return this.decideRow(row, decision, null);
  }

  async getPublicView(token: string) {
    const row = await this.approvals.findOne({ where: { actionToken: token } });
    if (!row) throw new NotFoundException('Approval not found');

    const now = Date.now();
    let viewStatus: 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed' = row.status;
    if (row.status === 'pending' && row.tokenExpiresAt.getTime() < now) {
      viewStatus = 'expired';
    }
    if (row.consumedAt) viewStatus = row.status === 'pending' ? 'consumed' : row.status;

    return {
      status: viewStatus,
      context: row.context,
      expiresAt: row.tokenExpiresAt,
      decidedAt: row.decidedAt,
    };
  }

  async expirePending(now = new Date()): Promise<ApprovalRequest[]> {
    const rows = await this.approvals
      .createQueryBuilder('a')
      .where("a.status = 'pending'")
      .andWhere('a.token_expires_at <= :now', { now })
      .andWhere('a.deleted_at IS NULL')
      .getMany();

    const expired: ApprovalRequest[] = [];
    for (const row of rows) {
      const ok = await this.markExpired(row);
      if (ok) expired.push(row);
    }
    return expired;
  }

  private async decideRow(
    row: ApprovalRequest,
    decision: 'approve' | 'reject',
    userId: string | null,
  ) {
    if (row.status !== 'pending') {
      return {
        status: row.status,
        decision: row.status,
        alreadyDecided: true,
        context: row.context,
        shareUrl: this.actionTokens.shareUrl(row.actionToken),
      };
    }

    if (row.tokenExpiresAt.getTime() < Date.now()) {
      await this.markExpired(row);
      throw new BadRequestException('Approval has expired');
    }

    const outcome: WaitOutcome = decision === 'approve' ? 'continue' : 'rejected';
    const newStatus: ApprovalStatus = decision === 'approve' ? 'approved' : 'rejected';

    const updated = await this.approvals
      .createQueryBuilder()
      .update(ApprovalRequest)
      .set({
        status: newStatus,
        decidedBy: userId,
        decidedAt: new Date(),
        consumedAt: new Date(),
      })
      .where('id = :id AND status = :pending', { id: row.id, pending: 'pending' })
      .execute();

    if (!updated.affected) {
      const fresh = await this.approvals.findOne({ where: { id: row.id } });
      return {
        status: fresh?.status ?? row.status,
        decision: fresh?.status ?? row.status,
        alreadyDecided: true,
        context: row.context,
      };
    }

    const resumed = await this.wait.resume(row.runId, outcome, { approvalId: row.id });
    return {
      status: newStatus,
      decision: newStatus,
      alreadyDecided: false,
      resumed,
      context: row.context,
      shareUrl: this.actionTokens.shareUrl(row.actionToken),
    };
  }

  private async markExpired(row: ApprovalRequest): Promise<boolean> {
    const result = await this.approvals
      .createQueryBuilder()
      .update(ApprovalRequest)
      .set({ status: 'expired', consumedAt: new Date() })
      .where('id = :id AND status = :pending', { id: row.id, pending: 'pending' })
      .execute();

    if (result.affected) {
      await this.wait.resume(row.runId, 'timed_out', { approvalId: row.id });
      return true;
    }
    return false;
  }

  private toDto(row: ApprovalRequest) {
    return {
      id: row.id,
      runId: row.runId,
      nodeId: row.nodeId,
      title: row.title,
      status: row.status,
      context: row.context,
      tokenExpiresAt: row.tokenExpiresAt,
      createdAt: row.createdAt,
      shareUrl: this.actionTokens.shareUrl(row.actionToken),
      actionToken: row.actionToken,
    };
  }
}
