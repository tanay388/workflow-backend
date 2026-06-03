import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import type { CatalogModelDto } from '../common/llm/llm.types';
import type { PlatformAdminUser } from '../admin/types/platform-admin.types';
import { CreateModelDto, UpdateModelDto } from './dto/model-catalog.dto';
import { LlmModelPriceHistory } from './entities/llm-model-price-history.entity';
import { LlmModel } from './entities/llm-model.entity';
import { ModelCatalogCache, modelToDto } from './model-catalog.cache';

@Injectable()
export class ModelCatalogService {
  constructor(
    @InjectRepository(LlmModel) private readonly models: Repository<LlmModel>,
    @InjectRepository(LlmModelPriceHistory)
    private readonly history: Repository<LlmModelPriceHistory>,
    private readonly cache: ModelCatalogCache,
    private readonly audit: AuditService,
  ) {}

  /** Admin list includes inactive models — reads DB for completeness. */
  async listAllFromDb(): Promise<CatalogModelDto[]> {
    const rows = await this.models.find({ order: { provider: 'ASC', modelKey: 'ASC' } });
    return rows.map(modelToDto);
  }

  listActive(): CatalogModelDto[] {
    return this.cache.getActive();
  }

  async create(admin: PlatformAdminUser, dto: CreateModelDto): Promise<CatalogModelDto> {
    assertNonNegativeRate(dto.inputPricePerMillionUsd, 'inputPricePerMillionUsd');
    assertNonNegativeRate(dto.outputPricePerMillionUsd, 'outputPricePerMillionUsd');

    const existing = await this.models.findOne({
      where: { provider: dto.provider, modelKey: dto.modelKey },
    });
    if (existing) {
      throw new ConflictException('Model already exists for this provider');
    }

    const model = await this.models.save(
      this.models.create({
        provider: dto.provider,
        modelKey: dto.modelKey.trim(),
        displayName: dto.displayName.trim(),
        inputPricePerMillionUsd: dto.inputPricePerMillionUsd,
        outputPricePerMillionUsd: dto.outputPricePerMillionUsd,
        isActive: dto.isActive ?? true,
        createdBy: admin.id,
        updatedBy: admin.id,
      }),
    );

    await this.recordPriceHistory(model, admin.id, dto.reason ?? 'initial price');

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.model.created',
      targetType: 'llm_model',
      targetId: model.id,
      meta: {
        platformAdminId: admin.id,
        after: snapshotModel(model),
      },
    });

    await this.cache.refresh();
    return modelToDto(model);
  }

  async update(
    admin: PlatformAdminUser,
    id: string,
    dto: UpdateModelDto,
  ): Promise<CatalogModelDto> {
    const model = await this.findModel(id);
    const before = snapshotModel(model);

    if (dto.inputPricePerMillionUsd !== undefined) {
      assertNonNegativeRate(dto.inputPricePerMillionUsd, 'inputPricePerMillionUsd');
      model.inputPricePerMillionUsd = dto.inputPricePerMillionUsd;
    }
    if (dto.outputPricePerMillionUsd !== undefined) {
      assertNonNegativeRate(dto.outputPricePerMillionUsd, 'outputPricePerMillionUsd');
      model.outputPricePerMillionUsd = dto.outputPricePerMillionUsd;
    }
    if (dto.displayName !== undefined) {
      model.displayName = dto.displayName.trim();
    }
    model.updatedBy = admin.id;

    const priceChanged =
      dto.inputPricePerMillionUsd !== undefined ||
      dto.outputPricePerMillionUsd !== undefined;

    await this.models.save(model);

    if (priceChanged) {
      await this.recordPriceHistory(model, admin.id, dto.reason ?? 'price update');
    }

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.model.updated',
      targetType: 'llm_model',
      targetId: model.id,
      meta: {
        platformAdminId: admin.id,
        before,
        after: snapshotModel(model),
      },
    });

    await this.cache.refresh();
    return modelToDto(model);
  }

  async activate(admin: PlatformAdminUser, id: string): Promise<CatalogModelDto> {
    const model = await this.findModel(id);
    const before = snapshotModel(model);
    model.isActive = true;
    model.updatedBy = admin.id;
    await this.models.save(model);

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.model.activated',
      targetType: 'llm_model',
      targetId: model.id,
      meta: { platformAdminId: admin.id, before, after: snapshotModel(model) },
    });

    await this.cache.refresh();
    return modelToDto(model);
  }

  async deactivate(admin: PlatformAdminUser, id: string): Promise<CatalogModelDto> {
    const model = await this.findModel(id);
    const before = snapshotModel(model);
    model.isActive = false;
    model.updatedBy = admin.id;
    await this.models.save(model);

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.model.deactivated',
      targetType: 'llm_model',
      targetId: model.id,
      meta: { platformAdminId: admin.id, before, after: snapshotModel(model) },
    });

    await this.cache.refresh();
    return modelToDto(model);
  }

  async priceHistory(modelId: string) {
    await this.findModel(modelId);
    return this.history.find({
      where: { modelId },
      order: { effectiveFrom: 'DESC' },
    });
  }

  private async findModel(id: string): Promise<LlmModel> {
    const model = await this.models.findOne({ where: { id } });
    if (!model) throw new NotFoundException('Model not found');
    return model;
  }

  private async recordPriceHistory(
    model: LlmModel,
    changedBy: string,
    reason: string,
  ): Promise<void> {
    await this.history.save(
      this.history.create({
        modelId: model.id,
        inputPricePerMillionUsd: model.inputPricePerMillionUsd,
        outputPricePerMillionUsd: model.outputPricePerMillionUsd,
        changedBy,
        reason,
      }),
    );
  }
}

function assertNonNegativeRate(value: string, field: string): void {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException(`${field} must be a non-negative number`);
  }
}

function snapshotModel(model: LlmModel) {
  return {
    id: model.id,
    provider: model.provider,
    modelKey: model.modelKey,
    displayName: model.displayName,
    inputPricePerMillionUsd: model.inputPricePerMillionUsd,
    outputPricePerMillionUsd: model.outputPricePerMillionUsd,
    isActive: model.isActive,
  };
}
