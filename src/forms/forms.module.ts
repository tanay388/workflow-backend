import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Form } from './entities/form.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { FormSubmissionService } from './form-submission.service';
import { FormService } from './form.service';
import { FormsController, WorkflowFormsController } from './forms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Form, FormSubmission, Workflow])],
  controllers: [WorkflowFormsController, FormsController],
  providers: [FormService, FormSubmissionService],
  exports: [FormService, FormSubmissionService],
})
export class FormsModule {}
