import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoService } from '../common/crypto/crypto.service';
import { LLMClientFactory } from '../common/llm/llm-client.factory';
import { ModelProviderRegistry } from '../common/llm/model-provider.registry';
import { isLlmProvider } from '../common/llm/llm.types';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { LlmCredential, type LlmCredentialStatus } from './entities/llm-credential.entity';

export interface LlmCredentialSummary {
  provider: string;
  keyFingerprint: string;
  label: string | null;
  status: LlmCredentialStatus;
  baseUrl: string | null;
}

@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(LlmCredential)
    private readonly repo: Repository<LlmCredential>,
    private readonly crypto: CryptoService,
    private readonly llmFactory: LLMClientFactory,
  ) {}

  async list(orgId: string): Promise<LlmCredentialSummary[]> {
    const rows = await this.repo.find({ where: { orgId }, order: { provider: 'ASC' } });
    return rows.map((r) => this.toSummary(r));
  }

  async upsert(
    orgId: string,
    provider: string,
    dto: { key: string; label?: string; base_url?: string },
  ): Promise<LlmCredentialSummary> {
    if (!isLlmProvider(provider)) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }

    const status = await this.llmFactory.validateProviderKey(provider, dto.key, dto.base_url);
    const aad = this.llmFactory.aad(orgId, provider);
    const encrypted = this.crypto.encrypt(dto.key, aad);
    const fingerprint = this.crypto.fingerprint(dto.key);

    let row = await this.repo.findOne({ where: { orgId, provider } });
    if (row) {
      row.encryptedKey = encrypted;
      row.keyFingerprint = fingerprint;
      row.label = dto.label ?? row.label;
      row.baseUrl = dto.base_url ?? row.baseUrl;
      row.status = status;
    } else {
      row = this.repo.create({
        orgId,
        provider,
        encryptedKey: encrypted,
        keyFingerprint: fingerprint,
        label: dto.label ?? null,
        baseUrl: dto.base_url ?? null,
        status,
      });
    }

    await this.repo.save(row);
    if (status === 'invalid') {
      throw new BadRequestException(
        `The ${provider} API key could not be validated. Check the key and try again.`,
      );
    }
    return this.toSummary(row);
  }

  async remove(orgId: string, provider: string): Promise<void> {
    if (!isLlmProvider(provider)) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
    const row = await this.repo.findOne({ where: { orgId, provider } });
    if (!row) throw new NotFoundException('Credential not found');
    await this.repo.softRemove(row);
  }

  async listForTenancy(tenancy: Tenancy): Promise<LlmCredentialSummary[]> {
    return this.list(tenancy.orgId!);
  }

  private toSummary(row: LlmCredential): LlmCredentialSummary {
    return {
      provider: row.provider,
      keyFingerprint: row.keyFingerprint,
      label: row.label,
      status: row.status,
      baseUrl: row.baseUrl,
    };
  }
}
