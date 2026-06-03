import { Injectable } from '@nestjs/common';
import type { PlatformAdminUser } from './types/platform-admin.types';
import { ModelCatalogService } from '../models/model-catalog.service';
import { CreateModelDto, UpdateModelDto } from '../models/dto/model-catalog.dto';

@Injectable()
export class AdminModelsService {
  constructor(private readonly catalog: ModelCatalogService) {}

  list() {
    return this.catalog.listAllFromDb();
  }

  create(admin: PlatformAdminUser, dto: CreateModelDto) {
    return this.catalog.create(admin, dto);
  }

  update(admin: PlatformAdminUser, id: string, dto: UpdateModelDto) {
    return this.catalog.update(admin, id, dto);
  }

  activate(admin: PlatformAdminUser, id: string) {
    return this.catalog.activate(admin, id);
  }

  deactivate(admin: PlatformAdminUser, id: string) {
    return this.catalog.deactivate(admin, id);
  }

  priceHistory(id: string) {
    return this.catalog.priceHistory(id);
  }
}
