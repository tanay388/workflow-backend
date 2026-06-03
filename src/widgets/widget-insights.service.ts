import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { Conversation } from '../chat/entities/conversation.entity';
import { ConversationMessage } from '../chat/entities/conversation-message.entity';
import type { FormFieldSchema } from '../forms/entities/form.entity';
import { FormSubmission } from '../forms/entities/form-submission.entity';
import { Form } from '../forms/entities/form.entity';
import { FormService } from '../forms/form.service';
import {
  leadDisplayName,
  visitorDomainFromMeta,
} from '../forms/required-name-field';
import { WorkflowRun } from '../runs/entities/workflow-run.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { ChatVisitor } from './entities/chat-visitor.entity';
import { ChatWidget } from './entities/chat-widget.entity';
import { WidgetService } from './widget.service';

export interface WidgetVisitorDto {
  id: string;
  displayName: string | null;
  email: string | null;
  visitorDomain: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  submissionCount: number;
  conversationCount: number;
  openConversationId: string | null;
}

export interface WidgetSubmissionFieldDto {
  key: string;
  label: string;
  value: string;
}

export interface WidgetSubmissionDto {
  id: string;
  formId: string;
  formName: string;
  visitorId: string | null;
  leadName: string;
  visitorEmail: string | null;
  visitorDomain: string | null;
  conversationId: string | null;
  fields: WidgetSubmissionFieldDto[];
  createdAt: string;
}

export interface WidgetSubmissionsPageDto {
  formFields: FormFieldSchema[];
  submissions: WidgetSubmissionDto[];
}

export interface WidgetConversationListItem {
  id: string;
  title: string | null;
  status: string;
  visitorId: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorDomain: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount: number;
}

export interface WidgetUsageStatsDto {
  visitorCount: number;
  submissionCount: number;
  conversationCount: number;
  messageCount: number;
  runCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

@Injectable()
export class WidgetInsightsService {
  constructor(
    private readonly widgets: WidgetService,
    private readonly forms: FormService,
    @InjectRepository(ChatVisitor) private readonly visitors: Repository<ChatVisitor>,
    @InjectRepository(Form) private readonly formRepo: Repository<Form>,
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    @InjectRepository(FormSubmission)
    private readonly submissions: Repository<FormSubmission>,
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
  ) {}

  async listVisitors(tenancy: Tenancy, workflowId: string): Promise<WidgetVisitorDto[]> {
    const widget = await this.requireWidget(tenancy, workflowId);
    const rows = await this.visitors.find({
      where: { widgetId: widget.id, orgId: tenancy.orgId! },
      order: { lastSeenAt: 'DESC' },
      take: 200,
    });
    if (!rows.length) return [];

    const ids = rows.map((v) => v.id);
    const submissionCounts = await this.submissions
      .createQueryBuilder('s')
      .select('s.visitor_id', 'visitorId')
      .addSelect('COUNT(*)', 'count')
      .where('s.visitor_id IN (:...ids)', { ids })
      .groupBy('s.visitor_id')
      .getRawMany<{ visitorId: string; count: string }>();

    const convStats = await this.conversations
      .createQueryBuilder('c')
      .select('c.visitor_id', 'visitorId')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `MAX(CASE WHEN c.status = 'open' THEN c.id::text ELSE NULL END)`,
        'openId',
      )
      .where('c.visitor_id IN (:...ids)', { ids })
      .andWhere("c.source = 'widget'")
      .andWhere('c.deleted_at IS NULL')
      .groupBy('c.visitor_id')
      .getRawMany<{ visitorId: string; count: string; openId: string | null }>();

    const subMap = new Map(submissionCounts.map((r) => [r.visitorId, Number(r.count)]));
    const convMap = new Map(
      convStats.map((r) => [
        r.visitorId,
        { count: Number(r.count), openId: r.openId },
      ]),
    );

    return rows.map((v) => {
      const conv = convMap.get(v.id);
      return {
        id: v.id,
        displayName: v.displayName,
        email: v.email,
        visitorDomain: visitorDomainFromMeta(v.meta),
        firstSeenAt: v.firstSeenAt.toISOString(),
        lastSeenAt: v.lastSeenAt.toISOString(),
        submissionCount: subMap.get(v.id) ?? 0,
        conversationCount: conv?.count ?? 0,
        openConversationId: conv?.openId ?? null,
      };
    });
  }

  async listSubmissions(
    tenancy: Tenancy,
    workflowId: string,
  ): Promise<WidgetSubmissionsPageDto> {
    const widget = await this.requireWidget(tenancy, workflowId);
    const published = await this.forms.findPublishedForWidget(widget.id, workflowId);
    const formFields = published?.schema ?? [];

    const submissionRows = await this.submissions
      .createQueryBuilder('s')
      .innerJoin(Form, 'f', 'f.id = s.form_id')
      .where('f.workflow_id = :workflowId', { workflowId })
      .andWhere('s.org_id = :orgId', { orgId: tenancy.orgId! })
      .orderBy('s.created_at', 'DESC')
      .limit(200)
      .getMany();

    if (!submissionRows.length) {
      return { formFields, submissions: [] };
    }

    const visitorIds = [
      ...new Set(
        submissionRows.map((s) => s.visitorId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const formIds = [...new Set(submissionRows.map((s) => s.formId))];

    const [visitors, forms] = await Promise.all([
      visitorIds.length
        ? this.visitors.findBy({ id: In(visitorIds) })
        : Promise.resolve([]),
      this.formRepo.findBy({ id: In(formIds) }),
    ]);

    const visitorMap = new Map(visitors.map((v) => [v.id, v]));
    const formMap = new Map(forms.map((f) => [f.id, f]));

    const submissions = submissionRows.map((s) => {
      const visitor = s.visitorId ? visitorMap.get(s.visitorId) : undefined;
      const form = formMap.get(s.formId);
      const data = this.parseSubmissionData(s.data);
      const schema = form?.schema ?? formFields;
      const leadName =
        leadDisplayName(data, visitor?.displayName) ?? 'Unknown visitor';
      return {
        id: s.id,
        formId: s.formId,
        formName: form?.name ?? 'Form',
        visitorId: s.visitorId,
        leadName,
        visitorEmail: visitor?.email ?? null,
        visitorDomain: visitorDomainFromMeta(visitor?.meta),
        conversationId: s.conversationId,
        fields: this.formatSubmissionFields(schema, data),
        createdAt: s.createdAt.toISOString(),
      };
    });

    return { formFields, submissions };
  }

  private parseSubmissionData(data: unknown): Record<string, unknown> {
    if (!data) return {};
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    if (typeof data === 'object') return data as Record<string, unknown>;
    return {};
  }

  private formatSubmissionFields(
    schema: FormFieldSchema[],
    data: Record<string, unknown>,
  ): WidgetSubmissionFieldDto[] {
    const keysInData = new Set(Object.keys(data));
    const ordered = schema.length
      ? schema
      : [...keysInData].map((key) => ({
          key,
          label: key,
          type: 'text' as const,
        }));

    return ordered
      .filter((f) => keysInData.has(f.key))
      .map((f) => ({
        key: f.key,
        label: f.label,
        value: this.formatFieldValue(data[f.key]),
      }));
  }

  private formatFieldValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }

  async listConversations(
    tenancy: Tenancy,
    workflowId: string,
  ): Promise<WidgetConversationListItem[]> {
    await this.requireWidget(tenancy, workflowId);
    const rows = await this.conversations
      .createQueryBuilder('c')
      .leftJoin(ChatVisitor, 'v', 'v.id = c.visitor_id')
      .select([
        'c.id AS id',
        'c.title AS title',
        'c.status AS status',
        'c.visitor_id AS "visitorId"',
        'v.email AS "visitorEmail"',
        'v.display_name AS "visitorName"',
        'c.last_message_at AS "lastMessageAt"',
        'c.created_at AS "createdAt"',
      ])
      .where('c.workflow_id = :workflowId', { workflowId })
      .andWhere('c.org_id = :orgId', { orgId: tenancy.orgId! })
      .andWhere("c.source = 'widget'")
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC')
      .limit(100)
      .getRawMany<{
        id: string;
        title: string | null;
        status: string;
        visitorId: string | null;
        visitorEmail: string | null;
        visitorName: string | null;
        lastMessageAt: Date | null;
        createdAt: Date;
      }>();

    if (!rows.length) return [];

    const visitorIds = [
      ...new Set(rows.map((r) => r.visitorId).filter((id): id is string => Boolean(id))),
    ];
    const visitorRows = visitorIds.length
      ? await this.visitors.findBy({ id: In(visitorIds) })
      : [];
    const visitorMap = new Map(visitorRows.map((v) => [v.id, v]));

    const ids = rows.map((r) => r.id);
    const msgCounts = await this.messages
      .createQueryBuilder('m')
      .select('m.conversation_id', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .where('m.conversation_id IN (:...ids)', { ids })
      .groupBy('m.conversation_id')
      .getRawMany<{ conversationId: string; count: string }>();
    const msgMap = new Map(msgCounts.map((r) => [r.conversationId, Number(r.count)]));

    return rows.map((r) => {
      const visitor = r.visitorId ? visitorMap.get(r.visitorId) : undefined;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        visitorId: r.visitorId,
        visitorEmail: visitor?.email ?? r.visitorEmail,
        visitorName: visitor?.displayName ?? r.visitorName,
        visitorDomain: visitorDomainFromMeta(visitor?.meta),
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : new Date(r.createdAt).toISOString(),
        messageCount: msgMap.get(r.id) ?? 0,
      };
    });
  }

  async getUsageStats(tenancy: Tenancy, workflowId: string): Promise<WidgetUsageStatsDto> {
    const widget = await this.requireWidget(tenancy, workflowId);

    const visitorCount = await this.visitors.count({
      where: { widgetId: widget.id, orgId: tenancy.orgId! },
    });

    const submissionCount = await this.submissions
      .createQueryBuilder('s')
      .innerJoin(Form, 'f', 'f.id = s.form_id')
      .where('f.workflow_id = :workflowId', { workflowId })
      .andWhere('s.org_id = :orgId', { orgId: tenancy.orgId! })
      .getCount();

    const conversationCount = await this.conversations.count({
      where: {
        workflowId,
        orgId: tenancy.orgId!,
        source: 'widget',
        deletedAt: IsNull(),
      },
    });

    const messageCount = await this.messages
      .createQueryBuilder('m')
      .innerJoin(Conversation, 'c', 'c.id = m.conversation_id')
      .where('c.workflow_id = :workflowId', { workflowId })
      .andWhere("c.source = 'widget'")
      .andWhere('c.deleted_at IS NULL')
      .getCount();

    const runAgg = await this.runs
      .createQueryBuilder('r')
      .select('COUNT(*)', 'runCount')
      .addSelect('COALESCE(SUM(r.total_input_tokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(r.total_output_tokens), 0)', 'outputTokens')
      .addSelect('COALESCE(SUM(r.total_cost_usd::numeric), 0)', 'costUsd')
      .where('r.workflow_id = :workflowId', { workflowId })
      .andWhere('r.org_id = :orgId', { orgId: tenancy.orgId! })
      .andWhere("r.trigger_source = 'widget'")
      .getRawOne<{
        runCount: string;
        inputTokens: string;
        outputTokens: string;
        costUsd: string;
      }>();

    return {
      visitorCount,
      submissionCount,
      conversationCount,
      messageCount,
      runCount: Number(runAgg?.runCount ?? 0),
      totalInputTokens: Number(runAgg?.inputTokens ?? 0),
      totalOutputTokens: Number(runAgg?.outputTokens ?? 0),
      totalCostUsd: Number(runAgg?.costUsd ?? 0),
    };
  }

  private async requireWidget(tenancy: Tenancy, workflowId: string): Promise<ChatWidget> {
    const dto = await this.widgets.getForWorkflow(tenancy, workflowId);
    if (!dto) throw new NotFoundException('Widget not published for this workflow');
    return this.widgets.findScoped(tenancy, dto.id);
  }
}
