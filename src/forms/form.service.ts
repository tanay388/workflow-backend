import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Form, type FormFieldSchema } from './entities/form.entity';
import { assertValidFormSchema } from './form-schema.validator';

export interface FormDto {
  id: string;
  workflowId: string;
  name: string;
  version: number;
  status: string;
  schema: FormFieldSchema[];
  boundWidgetId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class FormService {
  constructor(
    @InjectRepository(Form) private readonly forms: Repository<Form>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
  ) {}

  async listForWorkflow(tenancy: Tenancy, workflowId: string): Promise<FormDto[]> {
    await this.assertWorkflow(tenancy, workflowId);
    const rows = await this.forms.find({
      where: {
        workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    tenancy: Tenancy,
    workflowId: string,
    userId: string,
    name: string,
    schema: unknown,
  ): Promise<FormDto> {
    await this.assertWorkflow(tenancy, workflowId);
    const fields = assertValidFormSchema(schema);
    const row = this.forms.create({
      orgId: tenancy.orgId!,
      workspaceId: tenancy.workspaceId!,
      workflowId,
      name: name.trim() || 'Untitled form',
      version: 1,
      status: 'draft',
      schema: fields,
      createdBy: userId,
    });
    const saved = await this.forms.save(row);
    return this.toDto(saved);
  }

  async update(
    tenancy: Tenancy,
    formId: string,
    userId: string,
    patch: { name?: string; schema?: unknown; boundWidgetId?: string | null },
  ): Promise<FormDto> {
    const row = await this.findScoped(tenancy, formId);
    if (patch.name !== undefined) row.name = patch.name.trim() || row.name;
    if (patch.schema !== undefined) {
      row.schema = assertValidFormSchema(patch.schema);
      if (row.status === 'published') {
        row.version += 1;
        row.status = 'draft';
      }
    }
    if (patch.boundWidgetId !== undefined) row.boundWidgetId = patch.boundWidgetId;
    row.updatedBy = userId;
    const saved = await this.forms.save(row);
    return this.toDto(saved);
  }

  async publish(
    tenancy: Tenancy,
    formId: string,
    userId: string,
    boundWidgetId?: string | null,
  ): Promise<FormDto> {
    const row = await this.findScoped(tenancy, formId);
    row.status = 'published';
    if (boundWidgetId !== undefined) row.boundWidgetId = boundWidgetId;
    row.updatedBy = userId;
    const saved = await this.forms.save(row);
    return this.toDto(saved);
  }

  async findPublishedForWidget(widgetId: string, workflowId: string): Promise<Form | null> {
    return this.forms
      .createQueryBuilder('f')
      .where('f.workflow_id = :workflowId', { workflowId })
      .andWhere("f.status = 'published'")
      .andWhere('f.deleted_at IS NULL')
      .andWhere('(f.bound_widget_id = :widgetId OR f.bound_widget_id IS NULL)', {
        widgetId,
      })
      .orderBy(
        'CASE WHEN f.bound_widget_id = :widgetId THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('f.updated_at', 'DESC')
      .getOne();
  }

  async findScoped(tenancy: Tenancy, formId: string): Promise<Form> {
    const row = await this.forms.findOne({
      where: {
        id: formId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Form not found');
    return row;
  }

  private async assertWorkflow(tenancy: Tenancy, workflowId: string): Promise<void> {
    const wf = await this.workflows.findOne({
      where: {
        id: workflowId,
        orgId: tenancy.orgId!,
        workspaceId: tenancy.workspaceId!,
        deletedAt: IsNull(),
      },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
  }

  private toDto(row: Form): FormDto {
    return {
      id: row.id,
      workflowId: row.workflowId,
      name: row.name,
      version: row.version,
      status: row.status,
      schema: row.schema,
      boundWidgetId: row.boundWidgetId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
