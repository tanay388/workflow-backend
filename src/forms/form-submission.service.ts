import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { FormSubmission } from './entities/form-submission.entity';
import { Form } from './entities/form.entity';
import type { Form as FormEntity } from './entities/form.entity';
import { validateSubmission } from './form-schema.validator';

export interface FormSubmissionDto {
  id: string;
  formId: string;
  conversationId: string | null;
  visitorId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class FormSubmissionService {
  constructor(
    @InjectRepository(FormSubmission)
    private readonly submissions: Repository<FormSubmission>,
  ) {}

  async listForForm(tenancy: Tenancy, formId: string): Promise<FormSubmissionDto[]> {
    const rows = await this.submissions.find({
      where: { formId, orgId: tenancy.orgId! },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      formId: r.formId,
      conversationId: r.conversationId,
      visitorId: r.visitorId,
      data: r.data,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async create(params: {
    form: FormEntity;
    visitorId: string;
    conversationId?: string | null;
    data: Record<string, unknown>;
  }): Promise<FormSubmission> {
    const validated = validateSubmission(params.form.schema, params.data);
    const row = this.submissions.create({
      formId: params.form.id,
      orgId: params.form.orgId,
      visitorId: params.visitorId,
      conversationId: params.conversationId ?? null,
      data: validated,
    });
    return this.submissions.save(row);
  }

  async getLatestForVisitor(visitorId: string, formId: string): Promise<Record<string, unknown> | null> {
    const row = await this.submissions.findOne({
      where: { visitorId, formId },
      order: { createdAt: 'DESC' },
    });
    return row?.data ?? null;
  }

  async getLatestForVisitorWorkflow(
    visitorId: string,
    workflowId: string,
    widgetId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.submissions
      .createQueryBuilder('s')
      .innerJoin(Form, 'f', 'f.id = s.form_id')
      .where('s.visitor_id = :visitorId', { visitorId })
      .andWhere('f.workflow_id = :workflowId', { workflowId })
      .andWhere("f.status = 'published'")
      .andWhere('(f.bound_widget_id = :widgetId OR f.bound_widget_id IS NULL)', { widgetId })
      .orderBy('s.created_at', 'DESC')
      .getOne();
    return row?.data ?? null;
  }
}
