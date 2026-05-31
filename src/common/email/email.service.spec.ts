import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../config/config.service';
import { EmailService } from './email.service';

function makeService(smtp: Record<string, unknown> = {}): EmailService {
  const config = {
    smtp: { from: 'Growy <no-reply@growy.local>', secure: false, ...smtp },
  } as unknown as AppConfigService;
  return new EmailService(config);
}

describe('EmailService', () => {
  it('renders a template with variables', () => {
    const svc = makeService();
    const html = svc.render('smoke', { title: 'Welcome', message: 'Hello there' });
    expect(html).toContain('Welcome');
    expect(html).toContain('Hello there');
  });

  it('logs instead of sending when no SMTP host is configured (dev)', async () => {
    const svc = makeService();
    svc.onModuleInit(); // no host -> transporter stays null
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await svc.sendTemplate({
      to: 'a@b.com',
      subject: 'Test',
      template: 'smoke',
      context: { title: 'T', message: 'M' },
    });

    expect(result.delivered).toBe(false);
    expect(result.html).toContain('T');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
