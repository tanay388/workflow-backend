import { Injectable } from '@nestjs/common';
import { FormSubmissionService } from '../forms/form-submission.service';
import { FormService } from '../forms/form.service';
import type { ChatVisitor } from './entities/chat-visitor.entity';
import type { ChatWidget } from './entities/chat-widget.entity';
import { WidgetTurnService } from './widget-turn.service';

export interface WidgetVisitorSessionDto {
  formCompleted: boolean;
  activeConversationId: string | null;
}

@Injectable()
export class WidgetSessionService {
  constructor(
    private readonly forms: FormService,
    private readonly submissions: FormSubmissionService,
    private readonly turns: WidgetTurnService,
  ) {}

  async getSession(
    widget: ChatWidget,
    visitor: ChatVisitor,
  ): Promise<WidgetVisitorSessionDto> {
    const form = await this.forms.findPublishedForWidget(
      widget.id,
      widget.workflowId,
    );
    let formCompleted = !form || (form.schema?.length ?? 0) === 0;
    if (!formCompleted && form) {
      const latest = await this.submissions.getLatestForVisitor(visitor.id, form.id);
      formCompleted = latest !== null;
    }

    const open = await this.turns.findOpenConversation(widget, visitor);
    return {
      formCompleted,
      activeConversationId: open?.id ?? null,
    };
  }
}
