import { Injectable } from '@nestjs/common';

/** Phase 13+ agent-to-agent handoffs. */
@Injectable()
export class HandoffService {
  listHandoffs(_config: unknown): string[] {
    return [];
  }
}
