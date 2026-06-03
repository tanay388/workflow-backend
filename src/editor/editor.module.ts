import { Module } from '@nestjs/common';
import { EditorController } from './editor.controller';
import { NodeCatalogService } from './node-catalog.service';

@Module({
  controllers: [EditorController],
  providers: [NodeCatalogService],
  exports: [NodeCatalogService],
})
export class EditorModule {}
