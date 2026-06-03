import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomToken } from '../common/utils/ids';
import {
  leadDisplayName,
  visitorDomainFromMeta,
} from '../forms/required-name-field';
import { ChatVisitor } from './entities/chat-visitor.entity';
import type { ChatWidget } from './entities/chat-widget.entity';

export interface VisitorPageContext {
  pageHost?: string;
  pageOrigin?: string;
  referrer?: string;
}

export interface VisitorContext {
  visitor: ChatVisitor;
  visitorToken: string;
  visitorId: string;
}

@Injectable()
export class VisitorService {
  constructor(
    @InjectRepository(ChatVisitor) private readonly visitors: Repository<ChatVisitor>,
  ) {}

  async mintOrContinue(
    widget: ChatWidget,
    visitorToken?: string,
    contact?: {
      displayName?: string;
      email?: string;
      pageContext?: VisitorPageContext;
    },
  ): Promise<VisitorContext> {
    const token = visitorToken?.trim() || `v_${randomToken(24)}`;

    let row = await this.visitors.findOne({
      where: { visitorToken: token, widgetId: widget.id },
    });

    if (!row) {
      row = this.visitors.create({
        orgId: widget.orgId,
        widgetId: widget.id,
        visitorToken: token,
        displayName: contact?.displayName?.trim() || null,
        email: contact?.email?.trim() || null,
        meta: this.mergePageMeta(null, contact?.pageContext),
      });
      await this.visitors.save(row);
    } else {
      row.lastSeenAt = new Date();
      if (contact?.displayName) row.displayName = contact.displayName.trim();
      if (contact?.email) row.email = contact.email.trim();
      row.meta = this.mergePageMeta(row.meta, contact?.pageContext);
      row = await this.visitors.save(row);
    }

    return { visitor: row, visitorToken: token, visitorId: row.id };
  }

  async applySubmissionProfile(
    visitor: ChatVisitor,
    data: Record<string, unknown>,
    pageContext?: VisitorPageContext,
  ): Promise<ChatVisitor> {
    const name = leadDisplayName(data, visitor.displayName);
    if (name) visitor.displayName = name;
    const email = data.email;
    if (typeof email === 'string' && email.trim()) visitor.email = email.trim();
    visitor.meta = this.mergePageMeta(visitor.meta, pageContext);
    return this.visitors.save(visitor);
  }

  domainLabel(visitor: ChatVisitor): string | null {
    return visitorDomainFromMeta(visitor.meta);
  }

  private mergePageMeta(
    existing: Record<string, unknown> | null,
    pageContext?: VisitorPageContext,
  ): Record<string, unknown> | null {
    if (!pageContext?.pageHost?.trim() && !pageContext?.pageOrigin?.trim()) {
      return existing;
    }
    const meta: Record<string, unknown> = { ...(existing ?? {}) };
    const host = pageContext.pageHost?.trim();
    if (host) {
      meta.lastHost = host;
      if (!meta.firstHost) meta.firstHost = host;
    }
    if (pageContext.pageOrigin?.trim()) {
      meta.lastOrigin = pageContext.pageOrigin.trim();
    }
    if (pageContext.referrer?.trim()) {
      meta.lastReferrer = pageContext.referrer.trim();
    }
    meta.lastSeenPageAt = new Date().toISOString();
    return meta;
  }

  async findByToken(widgetId: string, visitorToken: string): Promise<ChatVisitor | null> {
    return this.visitors.findOne({ where: { widgetId, visitorToken } });
  }
}
