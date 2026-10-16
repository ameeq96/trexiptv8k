import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EN_UI, SUPPORTED_LOCALES } from './app.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const check = process.argv.includes('--check');
const languages = { en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', nl: 'Nederlands', pt: 'Português', ru: 'Русский', ur: 'اردو', ar: 'العربية', hi: 'हिन्दी' };
const languageLabels = { en: 'Language', es: 'Idioma', fr: 'Langue', it: 'Lingua', nl: 'Taal', pt: 'Idioma', ru: 'Язык', ur: 'زبان', ar: 'اللغة', hi: 'भाषा' };
const rtl = locale => ['ar', 'ur'].includes(locale);
const pathFor = locale => locale === 'en' ? '/' : `/${locale}/`;
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function decode(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0', copy: '©', ndash: '–', mdash: '—' };
  return value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity) => entity[0] === '#'
    ? String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10))
    : named[entity] ?? match);
}
const normalize = value => decode(value).replace(/\s+/g, ' ').trim();
let source = await readFile(join(root, 'index.html'), 'utf8');
source = source.replace(/\r\n/g, '\n')
  .replace(/\n[ \t]*<!-- landing-language-(?:head|switch):start -->[\s\S]*?<!-- landing-language-(?:head|switch):end -->/g, '')
  .replace(/<html\b[^>]*>/, '<html lang="en">')
  .replace('href="./styles.css"', 'href="/styles.css"').replace('src="./app.js"', 'src="/app.js"');
const domain = source.match(/data-domain="([a-z0-9.-]+)"/)?.[1];
if (!['trexiptv8k.store', 'opplexiptv.store', 'geoiptv.store', '5gliveiptv.store'].includes(domain)) throw new Error('Unknown landing domain.');
const origin = `https://${domain}`;
const tokens = /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/gi;
const requiredText = new Set();
function translateHtml(html, dictionary, locale) {
  function translated(raw) {
    const key = normalize(raw);
    if (!/[a-z]/i.test(key)) return raw;
    requiredText.add(key);
    if (locale === 'en') return raw;
    const value = dictionary.text[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${locale}: missing text ${key}`);
    return escape(value);
  }
  return html.replace(tokens, token => {
    if (/^<(script|style|!--)/i.test(token)) return token;
    if (token[0] !== '<') {
      const key = normalize(token);
      if (!/[a-z]/i.test(key)) return token;
      if (locale === 'en') { translated(token); return token; }
      return token.match(/^\s*/)[0] + translated(token) + token.match(/\s*$/)[0];
    }
    let tag = token.replace(/\b(aria-label|title|placeholder)="([^"]*)"/g, (_, attr, value) => `${attr}="${translated(value)}"`);
    if (/^<meta\s/i.test(tag) && /(?:name="(?:description|twitter:title|twitter:description)"|property="og:(?:title|description)")/.test(tag)) {
      tag = tag.replace(/content="([^"]*)"/, (_, value) => `content="${translated(value)}"`);
    }
    return tag;
  });
}
translateHtml(source, {}, 'en');
for (const match of source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  for (const node of JSON.parse(match[1])['@graph'] ?? []) {
    if (node['@type'] === 'WebPage') {
      for (const field of ['name', 'description']) requiredText.add(normalize(node[field]));
    }
  }
}
if (process.argv.includes('--list-text')) {
  console.log(JSON.stringify([...requiredText], null, 2));
  process.exit(0);
}
function validate(dictionary, locale) {
  if (dictionary.locale !== locale || !dictionary.text || !dictionary.ui || !dictionary.content) throw new Error(`${locale}: invalid dictionary shape.`);
  for (const [key, english] of Object.entries(EN_UI)) {
    const value = dictionary.ui[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${locale}: missing UI key ${key}`);
    const parameters = text => [...new Set(text.match(/\{[a-z]+\}/g) ?? [])].sort().join(',');
    if (parameters(english) !== parameters(value)) throw new Error(`${locale}: changed placeholders in ${key}`);
  }
  for (const [key, max] of Object.entries({ hero_heading: 160, hero_description: 1200, guide_heading: 160, guide_intro: 2000 })) {
    if (typeof dictionary.content[key] !== 'string' || !dictionary.content[key].trim() || [...dictionary.content[key]].length > max) throw new Error(`${locale}: invalid ${key}`);
  }
  if (!Array.isArray(dictionary.content.guide_sections) || !dictionary.content.guide_sections.length || dictionary.content.guide_sections.length > 8 ||
    !Array.isArray(dictionary.content.faqs) || dictionary.content.faqs.length > 8 || !Array.isArray(dictionary.content.highlights) || dictionary.content.highlights.length > 6) throw new Error(`${locale}: invalid content lists.`);
}
const outputs = new Map();
for (const locale of SUPPORTED_LOCALES) {
  const dictionary = locale === 'en' ? { text: {}, ui: EN_UI, content: null } : JSON.parse(await readFile(join(root, 'locales', `${locale}.json`), 'utf8'));
  if (locale !== 'en') validate(dictionary, locale);
  const pageUrl = origin + pathFor(locale);
  let html = translateHtml(source, dictionary, locale)
    .replace('<html lang="en">', `<html lang="${locale}" dir="${rtl(locale) ? 'rtl' : 'ltr'}">`)
    .replace(/(<link rel="canonical" href=")[^"]+("\s*\/?>)/, `$1${pageUrl}$2`)
    .replace(/(<meta property="og:url" content=")[^"]+("\s*\/?>)/, `$1${pageUrl}$2`)
    .replace(/href="(?:\.\/|\/)"/g, `href="${pathFor(locale)}"`)
    .replace(/(<input\b[^>]*type="(?:email|tel)")([^>]*>)/g, (tag, before, after) => /\bdir=/.test(tag) ? tag : `${before} dir="ltr"${after}`);
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (_, open, json, close) => {
    const schema = JSON.parse(json);
    for (const node of schema['@graph'] ?? []) {
      if (node['@type'] === 'WebSite') node.inLanguage = SUPPORTED_LOCALES;
      if (node['@type'] === 'WebPage') {
        node['@id'] = `${pageUrl}#webpage`;
        node.url = pageUrl;
        node.inLanguage = locale;
        if (locale !== 'en') {
          for (const field of ['name', 'description']) {
            const value = dictionary.text[normalize(node[field])];
            if (!value) throw new Error(`${locale}: missing schema ${field}`);
            node[field] = value;
          }
        }
      }
    }
    return `${open}\n      ${JSON.stringify(schema).replace(/</g, '\\u003c')}\n    ${close}`;
  });
  const alternates = SUPPORTED_LOCALES.map(code => `    <link rel="alternate" hreflang="${code}" href="${origin}${pathFor(code)}">`).join('\n');
  const inline = locale === 'en' ? '' : `\n    <script type="application/json" id="landing-language-data">${JSON.stringify({ locale, ui: dictionary.ui, content: dictionary.content }).replace(/</g, '\\u003c')}</script>`;
  const head = `\n    <!-- landing-language-head:start -->\n${alternates}\n    <link rel="alternate" hreflang="x-default" href="${origin}/">\n    <meta property="og:locale" content="${locale}">${inline}\n    <!-- landing-language-head:end -->`;
  html = html.replace(/\n[ \t]*<\/head>/, `${head}\n  </head>`);
  const links = SUPPORTED_LOCALES.map(code => `<li><a href="${pathFor(code)}" lang="${code}" dir="${rtl(code) ? 'rtl' : 'ltr'}" hreflang="${code}"${code === locale ? ' aria-current="page"' : ''}>${languages[code]}</a></li>`).join('');
  const menu = `\n        <!-- landing-language-switch:start -->\n        <details class="language-switcher"><summary aria-label="${languageLabels[locale]}"><span aria-hidden="true">◎</span> ${languages[locale]}</summary><nav aria-label="${languageLabels[locale]}"><ul>${links}</ul></nav></details>\n        <!-- landing-language-switch:end -->`;
  if (!/<nav\b[^>]*class="main-nav"[\s\S]*?<\/nav>/.test(html)) throw new Error('Main navigation not found.');
  html = html.replace(/(<nav\b[^>]*class="main-nav"[\s\S]*?<\/nav>)/, `$1${menu}`);
  outputs.set(join(root, locale === 'en' ? '' : locale, 'index.html'), html);
}
const urls = SUPPORTED_LOCALES.map(locale => `  <url>\n    <loc>${origin}${pathFor(locale)}</loc>\n${SUPPORTED_LOCALES.map(code => `    <xhtml:link rel="alternate" hreflang="${code}" href="${origin}${pathFor(code)}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/"/>\n  </url>`).join('\n');
outputs.set(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
for (const [path, html] of outputs) {
  if (check) {
    if (await readFile(path, 'utf8') !== html) throw new Error(`Generated output is stale: ${path}`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, html, 'utf8');
  }
}
console.log(`${domain}: ${SUPPORTED_LOCALES.length} language pages and sitemap ${check ? 'verified' : 'built'}; complete text/UI coverage.`);
