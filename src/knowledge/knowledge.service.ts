import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toFile } from 'openai';
import { Repository } from 'typeorm';
import { LLMClientFactory } from '../common/llm/llm-client.factory';
import { ObjectStorageService } from '../common/storage/object-storage.service';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeFile, type KnowledgeFileStatus } from './entities/knowledge-file.entity';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeBase) private readonly bases: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeFile) private readonly files: Repository<KnowledgeFile>,
    private readonly llmFactory: LLMClientFactory,
    private readonly storage: ObjectStorageService,
  ) {}

  async list(tenancy: Tenancy) {
    const rows = await this.bases.find({
      where: { orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toBaseSummary(r));
  }

  async get(tenancy: Tenancy, id: string) {
    const row = await this.findBase(tenancy, id);
    const fileRows = await this.files.find({ where: { kbId: id }, order: { createdAt: 'DESC' } });
    return { ...this.toBaseSummary(row), files: fileRows.map((f) => this.toFileSummary(f)) };
  }

  async create(tenancy: Tenancy, name: string) {
    const { client, byok } = await this.llmFactory.createOpenAiClient(tenancy.orgId!);
    const store = await client.vectorStores.create({ name });
    const row = this.bases.create({
      orgId: tenancy.orgId,
      workspaceId: tenancy.workspaceId,
      name,
      openaiVectorStoreId: store.id,
      byok,
      fileCount: 0,
    });
    await this.bases.save(row);
    return this.toBaseSummary(row);
  }

  async uploadFile(
    tenancy: Tenancy,
    kbId: string,
    filename: string,
    buffer: Buffer,
  ) {
    const kb = await this.findBase(tenancy, kbId);
    const storageKey = this.storage.storageKeyForKb(kbId, filename);
    await this.storage.putObject(storageKey, buffer);

    const fileRow = this.files.create({
      kbId,
      orgId: tenancy.orgId,
      filename,
      storageKey,
      status: 'uploading',
      bytes: String(buffer.length),
    });
    await this.files.save(fileRow);

    try {
      const { client } = await this.llmFactory.createOpenAiClient(tenancy.orgId!);
      const uploaded = await client.files.create({
        file: await toFile(buffer, filename),
        purpose: 'assistants',
      });
      await client.vectorStores.files.create(kb.openaiVectorStoreId, {
        file_id: uploaded.id,
      });

      fileRow.openaiFileId = uploaded.id;
      fileRow.status = 'indexed';
      await this.files.save(fileRow);

      kb.fileCount += 1;
      await this.bases.save(kb);
    } catch (err) {
      fileRow.status = 'failed';
      await this.files.save(fileRow);
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Failed to index file in vector store',
      );
    }

    return this.toFileSummary(fileRow);
  }

  async deleteBase(tenancy: Tenancy, kbId: string) {
    const kb = await this.findBase(tenancy, kbId);
    const fileRows = await this.files.find({ where: { kbId } });

    try {
      const { client } = await this.llmFactory.createOpenAiClient(tenancy.orgId!);
      await client.vectorStores.delete(kb.openaiVectorStoreId);
      for (const row of fileRows) {
        if (row.openaiFileId) {
          await client.files.delete(row.openaiFileId).catch(() => undefined);
        }
      }
    } catch {
      // Best-effort remote cleanup; local rows are still removed.
    }

    if (fileRows.length) {
      await this.files.softRemove(fileRows);
    }
    await this.bases.softRemove(kb);
    return { deleted: true };
  }

  async deleteFile(tenancy: Tenancy, kbId: string, fileId: string) {
    const kb = await this.findBase(tenancy, kbId);
    const fileRow = await this.files.findOne({ where: { id: fileId, kbId } });
    if (!fileRow) throw new NotFoundException('Knowledge file not found');

    try {
      const { client } = await this.llmFactory.createOpenAiClient(tenancy.orgId!);
      if (fileRow.openaiFileId) {
        await client.vectorStores.files
          .delete(fileRow.openaiFileId, { vector_store_id: kb.openaiVectorStoreId })
          .catch(() => undefined);
        await client.files.delete(fileRow.openaiFileId).catch(() => undefined);
      }
    } catch {
      // Best-effort remote cleanup.
    }

    await this.files.softRemove(fileRow);
    if (fileRow.status === 'indexed' && kb.fileCount > 0) {
      kb.fileCount -= 1;
      await this.bases.save(kb);
    }
    return { deleted: true };
  }

  async search(tenancy: Tenancy, kbId: string, query: string, topK = 5) {
    const kb = await this.findBase(tenancy, kbId);
    const { client } = await this.llmFactory.createOpenAiClient(tenancy.orgId!);

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: query,
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [kb.openaiVectorStoreId],
          max_num_results: topK,
        },
      ],
    });

    const chunks: { text: string; score?: number }[] = [];
    for (const item of response.output ?? []) {
      if (item.type === 'message') {
        for (const part of item.content ?? []) {
          if (part.type === 'output_text' && part.text) {
            chunks.push({ text: part.text });
          }
        }
      }
    }

    return { query, results: chunks };
  }

  async buildFileSearchTool(knowledgeBaseId: string | null | undefined) {
    if (!knowledgeBaseId) return [];
    const kb = await this.bases.findOne({ where: { id: knowledgeBaseId } });
    if (!kb) return [];
    return [
      {
        type: 'file_search' as const,
        vector_store_ids: [kb.openaiVectorStoreId],
        max_num_results: 5,
      },
    ];
  }

  private async findBase(tenancy: Tenancy, id: string): Promise<KnowledgeBase> {
    const row = await this.bases.findOne({
      where: { id, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!row) throw new NotFoundException('Knowledge base not found');
    return row;
  }

  private toBaseSummary(row: KnowledgeBase) {
    return {
      id: row.id,
      name: row.name,
      openaiVectorStoreId: row.openaiVectorStoreId,
      byok: row.byok,
      fileCount: row.fileCount,
      createdAt: row.createdAt,
    };
  }

  private toFileSummary(row: KnowledgeFile) {
    return {
      id: row.id,
      kbId: row.kbId,
      filename: row.filename,
      openaiFileId: row.openaiFileId,
      status: row.status as KnowledgeFileStatus,
      bytes: Number(row.bytes),
      createdAt: row.createdAt,
    };
  }
}
