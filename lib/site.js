export const site = {
  "brand": "trex",
  "theme": "trex",
  "name": "Trex IPTV 8K",
  "source": "trexiptv8k",
  "domain": "trexiptv8k.store",
  "favicon": "favicon.svg"
};

export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'it', 'nl', 'pt', 'ru', 'ur', 'ar', 'hi'];
export const LANGUAGE_NAMES = { en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', nl: 'Nederlands', pt: 'Português', ru: 'Русский', ur: 'اردو', ar: 'العربية', hi: 'हिन्दी' };
export const isRtl = locale => ['ar', 'ur'].includes(locale);
export function pathFor(locale, slug = '') {
  if (!SUPPORTED_LOCALES.includes(locale)) throw new Error('Unsupported locale');
  return '/' + (locale === 'en' ? '' : locale + '/') + (slug ? slug.replace(/^\/+|\/+$/g, '') + '/' : '');
}
export function copy(value, dictionary = {}) {
  const key = String(value).replace(/\s+/g, ' ').trim();
  return dictionary[key] ?? value;
}
export function resolveRoute(segments = []) {
  const parts = [...segments];
  const locale = SUPPORTED_LOCALES.includes(parts[0]) && parts[0] !== 'en' ? parts.shift() : 'en';
  return { locale, slug: parts.join('/') };
}
