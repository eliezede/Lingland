import { describe, expect, it } from 'vitest';
import {
  buildRequestFormEmbedCode,
  buildRequestFormEmbedUrl,
  normalizeRequestFormEmbedSettings,
  REQUEST_FORM_EMBED_DEFAULTS,
  validateRequestFormEmbedSettings,
} from './requestEmbedConfig';

describe('request form embed configuration', () => {
  it('builds a Wix-safe hash route with the selected workflow', () => {
    const config = normalizeRequestFormEmbedSettings({
      ...REQUEST_FORM_EMBED_DEFAULTS,
      formBaseUrl: 'https://portal.lingland.net/',
      serviceScope: 'TRANSLATION',
      lockService: true,
      sourceTag: 'Wix Main Site',
    });

    expect(buildRequestFormEmbedUrl(config)).toBe(
      'https://portal.lingland.net/#/request?embed=1&brand=0&intro=1&help=0&compact=1&transparent=1&source=wix-main-site&service=translation&lockService=1',
    );
  });

  it('generates responsive iframe code and validates the message origin', () => {
    const code = buildRequestFormEmbedCode({
      ...REQUEST_FORM_EMBED_DEFAULTS,
      desktopHeight: 980,
      mobileHeight: 1160,
    });

    expect(code).toContain('height: 980px');
    expect(code).toContain('height: 1160px');
    expect(code).toContain("event.origin !== 'https://lingland-2e52f.web.app'");
    expect(code).toContain('title="Request an interpreter or translation from Lingland"');
  });

  it('rejects insecure external form hosts', () => {
    const config = normalizeRequestFormEmbedSettings({
      ...REQUEST_FORM_EMBED_DEFAULTS,
      formBaseUrl: 'http://example.com',
    });
    expect(validateRequestFormEmbedSettings(config)).toContain('The form host must use HTTPS.');
  });
});
