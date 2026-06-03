import { WidgetService } from './widget.service';

describe('WidgetService embedSnippet', () => {
  it('includes public key and embed base', () => {
    const widgets = {} as never;
    const workflows = {} as never;
    const crypto = {} as never;
    const config = {
      widget: {
        embedBaseUrl: 'https://cdn.test/widget',
        apiPublicUrl: 'https://api.test',
        maxPayloadBytes: 1024,
      },
    };
    const service = new WidgetService(widgets, workflows, crypto, config as never);
    const snippet = service.embedSnippet('gw_abc123');
    expect(snippet).toContain('gw_abc123');
    expect(snippet).toContain('https://cdn.test/widget/embed.js');
    expect(snippet).toContain('data-api-base="https://api.test"');
  });
});
