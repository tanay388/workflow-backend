import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationMessage } from '../chat/entities/conversation-message.entity';
import { Conversation } from '../chat/entities/conversation.entity';

@Injectable()
export class WidgetRateLimitService {
  constructor(
    @InjectRepository(ConversationMessage)
    private readonly messages: Repository<ConversationMessage>,
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
  ) {}

  /** Count user-role messages today for this visitor (widget conversations only). */
  async countTodayMessages(visitorId: string): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    const row = await this.messages
      .createQueryBuilder('m')
      .innerJoin(Conversation, 'c', 'c.id = m.conversation_id')
      .where('c.visitor_id = :visitorId', { visitorId })
      .andWhere("c.source = 'widget'")
      .andWhere("m.role = 'user'")
      .andWhere('m.created_at >= :start', { start })
      .select('COUNT(*)::int', 'count')
      .getRawOne<{ count: number }>();

    return row?.count ?? 0;
  }

  async isOverLimit(visitorId: string, limit: number): Promise<boolean> {
    if (limit <= 0) return true;
    const count = await this.countTodayMessages(visitorId);
    return count >= limit;
  }
}
