import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth.types';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { CreateFormDto, PublishFormDto, UpdateFormDto } from './dto/form.dto';
import { FormSubmissionService } from './form-submission.service';
import { FormService } from './form.service';

@ApiTags('forms')
@Controller()
export class WorkflowFormsController {
  constructor(private readonly forms: FormService) {}

  @Get('workflows/:workflowId/forms')
  list(@CurrentTenancy() tenancy: Tenancy, @Param('workflowId') workflowId: string) {
    return this.forms.listForWorkflow(tenancy, workflowId);
  }

  @Roles(MemberRole.EDITOR)
  @Post('workflows/:workflowId/forms')
  create(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateFormDto,
  ) {
    return this.forms.create(tenancy, workflowId, user.id, dto.name, dto.schema);
  }
}

@ApiTags('forms')
@Controller('forms')
export class FormsController {
  constructor(
    private readonly forms: FormService,
    private readonly submissions: FormSubmissionService,
  ) {}

  @Roles(MemberRole.EDITOR)
  @Patch(':id')
  update(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.forms.update(tenancy, id, user.id, dto);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/publish')
  publish(
    @CurrentTenancy() tenancy: Tenancy,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PublishFormDto,
  ) {
    return this.forms.publish(tenancy, id, user.id, dto.boundWidgetId);
  }

  @Get(':id/submissions')
  listSubmissions(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.submissions.listForForm(tenancy, id);
  }
}
