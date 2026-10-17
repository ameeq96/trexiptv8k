import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const brands = { 'trexiptv8k.store': 'trex', 'opplexiptv.store': 'opplex', 'geoiptv.store': 'geo', '5gliveiptv.store': '5g' };
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pathFor = (locale, slug = '') => `/${locale === 'en' ? '' : locale + '/'}${slug ? slug + '/' : ''}`;
const requiredLabels = ['home', 'pages', 'packages', 'account', 'contact', 'readMore', 'backToGuides', 'language', 'loading', 'unavailable', 'retry', 'choosePlan', 'setup', 'guide', 'disclaimer', 'governingPolicy'];
const policySlugs = ['terms-of-service', 'privacy-policy', 'refund-policy'];
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const text = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing public page ${name}.`); return value; };

function validate(data, brand, locale) {
  if (!data || data.brand !== brand || data.locale !== locale || !data.labels || !Array.isArray(data.pages) || !data.pages.length) throw new Error(`${brand}/${locale}: invalid public page response.`);
  requiredLabels.forEach(key => text(data.labels[key], `label ${key}`));
  const slugs = new Set();
  for (const page of data.pages) {
    if (!page || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(page.slug) || slugs.has(page.slug) ||
        ['pricing', 'iptv-subscription-service'].includes(page.slug)) throw new Error(`${locale}: invalid or duplicate page slug.`);
    slugs.add(page.slug);
    ['title', 'description', 'intro', 'kind'].forEach(key => text(page[key], `${page.slug} ${key}`));
    if (!['editorial', 'packages', 'contact', 'activation', 'blogs', 'article'].includes(page.kind)) throw new Error(`${locale}: unknown page kind.`);
    if (!Array.isArray(page.sections) || !page.sections.length) throw new Error(`${locale}: missing page sections.`);
    page.sections.forEach(section => ['heading', 'body'].forEach(key => text(section?.[key], `${page.slug} section ${key}`)));
  }
  for (const slug of ['about', 'contact', 'faqs', 'packages', 'reseller-panel', 'iptv-applications', 'movies', 'shop', 'activate', 'activate-info', 'blogs', 'setup', ...policySlugs]) {
    if (!slugs.has(slug)) throw new Error(`${locale}: required page ${slug} is missing.`);
  }
  if (data.pages.filter(page => page.kind === 'packages').length !== 1) throw new Error(`${locale}: exactly one packages page is required.`);
}

function pageNavigation(html, data, locale, current = '') {
  const links = data.pages.filter(page => page.kind !== 'article').map(page =>
    `<a href="${pathFor(locale, page.slug)}"${page.slug === current ? ' aria-current="page"' : ''}>${escape(page.title)}</a>`).join('');
  const menu = `\n    <!-- landing-pages-nav:start -->\n    <div class="container public-navigation"><details class="public-pages-menu"><summary>${escape(data.labels.pages)}</summary><nav aria-label="${escape(data.labels.pages)}">${links}</nav></details><a href="${pathFor(locale, 'packages')}">${escape(data.labels.packages)}</a><a href="${pathFor(locale, 'contact')}">${escape(data.labels.contact)}</a></div>\n    <!-- landing-pages-nav:end -->`;
  html = html.replace(/\n[ \t]*<!-- landing-pages-nav:start -->[\s\S]*?<!-- landing-pages-nav:end -->/g, '').replace('</header>', '</header>' + menu);
  const destinations = { '#plans': 'packages', '#devices': 'iptv-applications', '#faq': 'faqs', '#support': 'contact' };
  html = html.replace(/(<nav\b[^>]*class="main-nav"[^>]*>)([\s\S]*?)(<\/nav>)/, (_, open, body, close) =>
    open + body.replace(/href="([^"]+)"/g, (attr, href) => {
      const slug = destinations[href] || href.match(/^\/(?:[a-z]{2}\/)?(packages|iptv-applications|faqs|contact)\/$/)?.[1];
      return slug ? `href="${pathFor(locale, slug)}"` : attr;
    }) + close);
  html = html.replace(/\bdata-central-path="\/(terms-of-service|privacy-policy|refund-policy)"/g, 'data-local-path="/$1"');
  html = html.replace(/(<a\b[^>]*data-local-path="\/([^"]+)"[^>]*href=")[^"]+(")/g, (_, before, slug, after) => before + pathFor(locale, slug) + after);
  return html.replace(/<body\b([^>]*)>/, (_, attributes) => '<body' + attributes.replace(/\sdata-public-pages="[^"]*"/g, '') + ' data-public-pages="true">');
}

function sectionFrom(html, id) {
  const match = html.match(new RegExp('<section\\b[^>]*\\bid="' + id + '"[^>]*>[\\s\\S]*?<\\/section>'));
  if (!match) throw new Error(`Shared ${id} section is missing.`);
  return match[0];
}

function pricingMarkup(labels) {
  return `<section class="public-pricing" aria-labelledby="public-pricing-heading"><h2 id="public-pricing-heading">${escape(labels.packages)}</h2><div class="public-price-overview"><p id="hero-provider"></p><p class="hero-price" id="hero-price">—</p><p id="hero-plan">${escape(labels.loading)}</p><p id="api-status" role="status"></p></div><div class="plans-toolbar"><div id="provider-options" class="provider-options"></div><p id="plan-summary" class="plan-summary"></p></div><div class="catalog-feedback"><p id="catalog-status" role="status">${escape(labels.loading)}</p><button class="button button-secondary" id="retry-catalog" type="button" hidden>${escape(labels.retry)}</button></div><div class="plan-grid" id="plan-grid" aria-live="polite" aria-busy="true"></div></section>`;
}

function contentMarkup(page, data, locale) {
  const labels = data.labels;
  let extra = '';
  if (page.kind === 'packages') extra += pricingMarkup(labels);
  if (page.kind === 'blogs') {
    extra += `<div class="public-article-grid">${data.pages.filter(item => item.kind === 'article').map(item =>
      `<article class="public-article-card"><h2><a href="${pathFor(locale, item.slug)}">${escape(item.title)}</a></h2><p>${escape(item.description)}</p><a class="text-link" href="${pathFor(locale, item.slug)}">${escape(labels.readMore)} <span aria-hidden="true">→</span></a></article>`).join('')}</div>`;
  }
  if (page.kind === 'article') extra += `<a class="text-link" href="${pathFor(locale, 'blogs')}">${escape(labels.backToGuides)}</a>`;
  if (page.kind === 'contact') extra += `<button class="button button-primary" type="button" data-public-contact>${escape(labels.contact)}</button>`;
  if (page.kind === 'activation') extra += `<a class="button button-primary" data-central-path="/${page.slug === 'activate-info' ? 'activate-info' : 'activate'}" href="https://opplexiptv.com/${page.slug === 'activate-info' ? 'activate-info' : 'activate'}">${escape(page.title)} <span aria-hidden="true">↗</span></a>`;
  if (policySlugs.includes(page.slug)) extra = `<aside class="public-policy-notice"><p>${escape(labels.disclaimer)}</p><a href="https://opplexiptv.com/${page.slug}">${escape(labels.governingPolicy)} — opplexiptv.com <span aria-hidden="true">↗</span></a></aside>` + extra;
  const sections = page.sections.map((section, index) => `<section class="public-copy-section" aria-labelledby="public-section-${index}"><h2 id="public-section-${index}">${escape(section.heading)}</h2><p>${escape(section.body)}</p></section>`).join('\n');
  return `<main id="main" class="public-page"><div class="container"><nav class="public-breadcrumb" aria-label="${escape(labels.pages)}"><a href="${pathFor(locale)}">${escape(labels.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${escape(page.title)}</span></nav><header class="public-page-heading"><p class="eyebrow">${escape(labels.guide)}</p><h1>${escape(page.title)}</h1><p class="public-intro">${escape(page.intro)}</p></header><div class="public-page-layout"><article class="public-page-copy">${sections}${extra}</article><aside class="public-next-steps"><h2>${escape(labels.pages)}</h2><a href="${pathFor(locale, 'packages')}">${escape(labels.choosePlan)}</a><a href="${pathFor(locale, 'setup')}">${escape(labels.setup)}</a><a href="${pathFor(locale, 'contact')}">${escape(labels.contact)}</a><a data-central-path="/account" href="https://opplexiptv.com/account">${escape(labels.account)} <span aria-hidden="true">↗</span></a></aside></div></div></main>`;
}

function childPage(home, page, data, locale, origin, locales) {
  let html = pageNavigation(home, data, locale, page.slug);
  const support = sectionFrom(home, 'support');
  html = html.replace(/<main\b[^>]*>[\s\S]*?<\/main>/, contentMarkup(page, data, locale).replace('</main>', support + '</main>'));
  html = html.replace(/<body\b([^>]*)>/, (_, attrs) => `<body${attrs.replace(/\sdata-page="[^"]*"/g, '')} data-page="${page.kind}">`);
  const url = origin + pathFor(locale, page.slug);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/(<meta\s[^>]*(?:name="(?:description|twitter:description)"|property="og:description")[^>]*content=")[^"]*(")/g, (_, a, b) => a + escape(page.description) + b)
    .replace(/(<meta\s[^>]*(?:name="twitter:title"|property="og:title")[^>]*content=")[^"]*(")/g, (_, a, b) => a + escape(page.title) + b)
    .replace(/(<link rel="canonical" href=")[^"]+(")/, `$1${url}$2`)
    .replace(/(<meta property="og:url" content=")[^"]+(")/, `$1${url}$2`);
  html = html.replace(/(<link rel="alternate" hreflang="([^"]+)" href=")[^"]+(")/g, (_, before, code, after) =>
    before + origin + pathFor(code === 'x-default' ? 'en' : code, page.slug) + after);
  html = html.replace(/(<!-- landing-language-switch:start -->)([\s\S]*?)(<!-- landing-language-switch:end -->)/, (_, open, menu, close) =>
    open + menu.replace(/(<a href=")[^"]+("[^>]*hreflang="([^"]+)")/g, (_, before, after, code) => before + pathFor(code, page.slug) + after) + close);
  const brandName = home.match(/data-brand="([^"]+)"/)?.[1] || '';
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: brandName, inLanguage: locales },
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: page.title, description: page.description, inLanguage: locale, isPartOf: { '@id': origin + '/#website' }, breadcrumb: { '@id': url + '#breadcrumb' } },
    { '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
      { '@type': 'ListItem', position: 1, name: data.labels.home, item: origin + pathFor(locale) },
      { '@type': 'ListItem', position: 2, name: page.title, item: url },
    ] },
  ] };
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${json(schema)}</script>`);
  return html;
}

export async function addPublicPages({ root, outputs, origin, locales }) {
  const domain = new URL(origin).hostname;
  const brand = brands[domain];
  if (!brand) throw new Error('Unknown public-page brand.');
  const apiIndex = process.argv.indexOf('--api-base');
  const base = apiIndex < 0 ? 'http://127.0.0.1:8001' : process.argv[apiIndex + 1];
  const api = new URL(base);
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password) throw new Error('Invalid content API base.');
  const dataByLocale = new Map();
  for (const locale of locales) {
    const response = await fetch(new URL(`/api/v1/site/brands/${brand}/pages?locale=${locale}`, api), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${brand}/${locale}: content API returned ${response.status}.`);
    const result = await response.json();
    validate(result.data, brand, locale);
    dataByLocale.set(locale, result.data);
  }
  const inventory = data => data.pages.map(page => page.slug + ':' + page.kind).sort().join('|');
  const english = dataByLocale.get('en');
  for (const locale of locales) {
    if (inventory(dataByLocale.get(locale)) !== inventory(english)) throw new Error(`${brand}/${locale}: translated page inventory differs.`);
  }
  const sitemapRows = [];
  for (const locale of locales) {
    const data = dataByLocale.get(locale);
    const homePath = join(root, locale === 'en' ? '' : locale, 'index.html');
    const home = pageNavigation(outputs.get(homePath) || await readFile(homePath, 'utf8'), data, locale);
    outputs.set(homePath, home);
    for (const page of data.pages) outputs.set(join(root, locale === 'en' ? '' : locale, ...page.slug.split('/'), 'index.html'), childPage(home, page, data, locale, origin, locales));
    for (const slug of ['', ...data.pages.map(page => page.slug)]) {
      const alternate = locales.map(code => `    <xhtml:link rel="alternate" hreflang="${code}" href="${origin}${pathFor(code, slug)}"/>`).join('\n');
      sitemapRows.push(`  <url>\n    <loc>${origin}${pathFor(locale, slug)}</loc>\n${alternate}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${pathFor('en', slug)}"/>\n  </url>`);
    }
  }
  outputs.set(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapRows.join('\n')}\n</urlset>\n`);
  console.log(`${domain}: ${english.pages.length} public pages in ${locales.length} languages validated from the central API.`);
}
