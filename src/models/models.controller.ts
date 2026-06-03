import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModelCatalogService } from './model-catalog.service';

@ApiTags('models')
@Controller()
export class ModelsController {
  constructor(private readonly catalog: ModelCatalogService) {}

  @Get('models')
  listActive() {
    return this.catalog.listActive();
  }
}
