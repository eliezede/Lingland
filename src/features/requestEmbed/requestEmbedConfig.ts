import type { RequestFormEmbedSettings } from '../../types';

export const REQUEST_FORM_EMBED_DEFAULTS: RequestFormEmbedSettings = {
  formBaseUrl: 'https://lingland-2e52f.web.app',
  serviceScope: 'ALL',
  lockService: false,
  showBranding: false,
  showIntro: true,
  showHelpPanel: false,
  compactLayout: true,
  transparentBackground: true,
  desktopHeight: 1040,
  mobileHeight: 1180,
  frameTitle: 'Request an interpreter or translation from Lingland',
  sourceTag: 'wix',
};

const clampHeight = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1800, Math.max(640, Math.round(parsed)));
};

export const normalizeRequestFormEmbedSettings = (
  value?: Partial<RequestFormEmbedSettings> | null,
): RequestFormEmbedSettings => ({
  ...REQUEST_FORM_EMBED_DEFAULTS,
  ...(value || {}),
  formBaseUrl: String(value?.formBaseUrl || REQUEST_FORM_EMBED_DEFAULTS.formBaseUrl).trim().replace(/\/+$/, ''),
  serviceScope: ['ALL', 'INTERPRETING', 'TRANSLATION'].includes(String(value?.serviceScope))
    ? value!.serviceScope as RequestFormEmbedSettings['serviceScope']
    : REQUEST_FORM_EMBED_DEFAULTS.serviceScope,
  desktopHeight: clampHeight(value?.desktopHeight, REQUEST_FORM_EMBED_DEFAULTS.desktopHeight),
  mobileHeight: clampHeight(value?.mobileHeight, REQUEST_FORM_EMBED_DEFAULTS.mobileHeight),
  frameTitle: String(value?.frameTitle || REQUEST_FORM_EMBED_DEFAULTS.frameTitle).trim().slice(0, 120),
  sourceTag: String(value?.sourceTag || REQUEST_FORM_EMBED_DEFAULTS.sourceTag)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || REQUEST_FORM_EMBED_DEFAULTS.sourceTag,
});

export const validateRequestFormEmbedSettings = (config: RequestFormEmbedSettings) => {
  const errors: string[] = [];
  try {
    const url = new URL(config.formBaseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      errors.push('The form host must use HTTPS.');
    }
  } catch {
    errors.push('Enter a valid form host URL.');
  }
  if (!config.frameTitle.trim()) errors.push('Enter an accessible frame title.');
  if (config.desktopHeight < 640 || config.desktopHeight > 1800) errors.push('Desktop height must be between 640 and 1800 px.');
  if (config.mobileHeight < 640 || config.mobileHeight > 1800) errors.push('Mobile height must be between 640 and 1800 px.');
  return errors;
};

const booleanParam = (value: boolean) => value ? '1' : '0';

export const buildRequestFormEmbedUrl = (input: RequestFormEmbedSettings) => {
  const config = normalizeRequestFormEmbedSettings(input);
  const params = new URLSearchParams({
    embed: '1',
    brand: booleanParam(config.showBranding),
    intro: booleanParam(config.showIntro),
    help: booleanParam(config.showHelpPanel),
    compact: booleanParam(config.compactLayout),
    transparent: booleanParam(config.transparentBackground),
    source: config.sourceTag,
  });
  if (config.serviceScope !== 'ALL') {
    params.set('service', config.serviceScope.toLowerCase());
    params.set('lockService', booleanParam(config.lockService));
  }
  return `${config.formBaseUrl}/#/request?${params.toString()}`;
};

const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const buildRequestFormEmbedCode = (input: RequestFormEmbedSettings) => {
  const config = normalizeRequestFormEmbedSettings(input);
  const sourceUrl = buildRequestFormEmbedUrl(config);
  const origin = new URL(config.formBaseUrl).origin;
  return `<style>
  #lingland-request-form { width: 100%; height: ${config.desktopHeight}px; border: 0; display: block; }
  @media (max-width: 767px) { #lingland-request-form { height: ${config.mobileHeight}px; } }
</style>
<iframe
  id="lingland-request-form"
  src="${escapeAttribute(sourceUrl)}"
  title="${escapeAttribute(config.frameTitle)}"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
<script>
  window.addEventListener('message', function (event) {
    if (event.origin !== '${escapeAttribute(origin)}' || !event.data || event.data.type !== 'LINGLAND_REQUEST_FORM_RESIZE') return;
    var frame = document.getElementById('lingland-request-form');
    if (!frame) return;
    var requestedHeight = Number(event.data.height || 0);
    if (requestedHeight > 0) frame.style.height = Math.max(640, Math.min(1800, requestedHeight)) + 'px';
  });
</script>`;
};
