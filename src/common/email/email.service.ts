import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../config/config.service';

export interface SendTemplateOptions {
  to: string;
  subject: string;
  /** Template file name without extension, under email/templates/*.hbs */
  template: string;
  context?: Record<string, unknown>;
}

export interface SendResult {
  delivered: boolean;
  html: string;
}

/**
 * Reusable templated email via Nodemailer + Handlebars (TRD §2, §10.1).
 * Used by OTP (P02), usage alerts (P15) and approval links (P10).
 * In dev with no SMTP configured, the rendered HTML is logged instead of sent —
 * never Firebase.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const smtp = this.config.smtp;
    if (!smtp.host) {
      this.logger.warn('No SMTP host configured — emails will be logged, not sent (dev mode)');
      return;
    }
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<SendResult> {
    const html = this.render(opts.template, opts.context ?? {});
    if (!this.transporter) {
      this.logger.log(`[email:dev] to=${opts.to} subject="${opts.subject}"\n${html}`);
      return { delivered: false, html };
    }
    await this.transporter.sendMail({
      from: this.config.smtp.from,
      to: opts.to,
      subject: opts.subject,
      html,
    });
    return { delivered: true, html };
  }

  /** Render a Handlebars template by name, compiling + caching on first use. */
  render(template: string, context: Record<string, unknown>): string {
    let compiled = this.templates.get(template);
    if (!compiled) {
      const source = readFileSync(join(__dirname, 'templates', `${template}.hbs`), 'utf8');
      compiled = Handlebars.compile(source);
      this.templates.set(template, compiled);
    }
    return compiled(context);
  }
}
