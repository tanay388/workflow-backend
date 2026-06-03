import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { NodeCatalogService } from './node-catalog.service';

@ApiTags('editor')
@SkipTenancy()
@Controller('node-types')
export class EditorController {
  constructor(private readonly catalog: NodeCatalogService) {}

  @Get()
  listNodeTypes() {
    return this.catalog.listAll();
  }
}
