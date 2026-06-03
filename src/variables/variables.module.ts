import { Module } from '@nestjs/common';
import { EditorModule } from '../editor/editor.module';
import { ExpressionService } from './expression.service';
import { GraphValidatorService } from './graph-validator.service';
import { OutputSchemaService } from './output-schema.service';
import { UpstreamGraphService } from './upstream-graph.service';
import { VariablesService } from './variables.service';

@Module({
  imports: [EditorModule],
  providers: [
    UpstreamGraphService,
    OutputSchemaService,
    ExpressionService,
    GraphValidatorService,
    VariablesService,
  ],
  exports: [
    UpstreamGraphService,
    OutputSchemaService,
    ExpressionService,
    GraphValidatorService,
    VariablesService,
  ],
})
export class VariablesModule {}
