import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly localRoot = join(process.cwd(), '.uploads');

  constructor(private readonly cfg: AppConfigService) {}

  /**
   * Persist raw bytes before forwarding to OpenAI (DO Spaces when configured, else local dev store).
   */
  async putObject(key: string, body: Buffer): Promise<string> {
    if (this.cfg.spaces.enabled) {
      // Phase 08: S3-compatible upload can be wired when SPACES_* env is set.
      this.logger.warn('SPACES configured but S3 client not wired; using local fallback');
    }
    const dir = join(this.localRoot, key.split('/')[0] ?? 'default');
    await mkdir(dir, { recursive: true });
    const path = join(this.localRoot, key);
    await writeFile(path, body);
    return key;
  }

  storageKeyForKb(kbId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${kbId}/${randomUUID()}-${safe}`;
  }
}
