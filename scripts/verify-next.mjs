import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { site, SUPPORTED_LOCALES, pathFor } from '../lib/site.js';
import { loadDictionary } from '../lib/i18n.js';
import { availablePlans, checkoutUrl, centralUrl, newRequestId, postLanding } from '../lib/api.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
async function collect(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await collect(path));
    else if (item.name.endsWith('.html')) files.push(path);
  }
  return files;
}
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).replace(/&#x27;|&#39;|&apos;/g, "'");
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key.toLowerCase(), decode(value)]));
}
function tags(html, tag) { return [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>', 'g'))].map(match => attributes(match[0])); }
function meta(html, key) { return tags(html, 'meta').find(tag => tag.name === key || tag.property === key)?.content; }
function canonical(html) { return tags(html, 'link').find(tag => tag.rel === 'canonical')?.href; }
function alternates(html) { return tags(html, 'link').filter(tag => tag.rel === 'alternate' && tag.hreflang).map(tag => tag.hreflang + ':' + tag.href).sort(); }
function title(html) { return decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''); }
const visibleHtml = html => html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
const text = html => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const identifiers = html => tags(html, '[a-z][\\w:-]*').filter(tag => Object.hasOwn(tag, 'id')).map(tag => tag.id);
const origin = 'https://' + site.domain;

const sourcePages = {
  trex: {
    'iptv-applications': 'https://docs.videolan.me/vlc-android-user/',
    setup: 'https://support.google.com/googletv/answer/10070482?hl=en',
    'blogs/check-your-playback-chain': 'https://support.google.com/googletv/answer/10070482?hl=en',
  },
  opplex: {
    'iptv-applications': 'https://docs.videolan.me/vlc-android-user/',
    'blogs/a-step-by-step-playback-check': 'https://support.google.com/googletv/answer/10070482?hl=en',
  },
  geo: { 'iptv-applications': 'https://docs.videolan.me/vlc-android-user/video/video_player.html' },
  '5g': { 'iptv-applications': 'https://support.apple.com/en-ca/102433' },
};
const truthfulLabels = {
  en: ['Business enquiries', 'Viewing guide', 'Equipment guide'],
  es: ['Consultas comerciales', 'Guía de visualización', 'Guía de equipos'],
  fr: ['Demandes professionnelles', 'Guide de visionnage', 'Guide de l’équipement'],
  it: ['Richieste commerciali', 'Guida alla visione', 'Guida ai dispositivi'],
  nl: ['Zakelijke vragen', 'Kijkgids', 'Apparatengids'],
  pt: ['Contactos comerciais', 'Guia de visualização', 'Guia de equipamentos'],
  ru: ['Вопросы для бизнеса', 'Руководство по просмотру', 'Руководство по устройствам'],
  ur: ['کاروباری سوالات', 'دیکھنے کی رہنمائی', 'آلات کی رہنمائی'],
  ar: ['استفسارات الأعمال', 'دليل المشاهدة', 'دليل الأجهزة'],
  hi: ['व्यावसायिक पूछताछ', 'देखने की गाइड', 'डिवाइस गाइड'],
};
const sourceHosts = new Set(['support.google.com', 'support.apple.com', 'docs.videolan.me', 'www.videolan.org']);

function verifySchema(html, visible, before, slug) {
  const local = before.file;
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, local + ' single structured-data graph');
  const schema = JSON.parse(scripts[0][1]);
  assert.equal(schema['@context'], 'https://schema.org', local + ' schema context');
  assert.ok(Array.isArray(schema['@graph']), local + ' schema graph');
  const graph = schema['@graph'];
  const ids = graph.map(node => node['@id']);
  assert.equal(new Set(ids).size, ids.length, local + ' unique schema IDs');
  for (const node of graph) {
    for (const value of [node['@id'], ...(node.url ? [node.url] : [])]) {
      const url = new URL(value);
      assert.ok(url.origin === origin && !url.username && !url.password, local + ' absolute own-domain schema URL');
    }
  }
  const nodeOf = type => {
    const nodes = graph.filter(node => node['@type'] === type);
    assert.equal(nodes.length, 1, local + ' single ' + type);
    return nodes[0];
  };
  const website = nodeOf('WebSite');
  assert.equal(website['@id'], origin + '/#website', local + ' website ID');
  assert.equal(website.url, origin + '/', local + ' website URL');
  assert.equal(website.name, site.name, local + ' website name');
  assert.deepEqual(website.inLanguage, SUPPORTED_LOCALES, local + ' website languages');
  const page = nodeOf('WebPage');
  assert.equal(page['@id'], before.canonical + '#webpage', local + ' webpage ID');
  assert.equal(page.url, before.canonical, local + ' webpage URL');
  assert.equal(page.name, title(html), local + ' schema title matches metadata');
  assert.equal(page.description, meta(html, 'description'), local + ' schema description matches metadata');
  assert.equal(page.inLanguage, before.lang, local + ' schema language');
  assert.equal(page.isPartOf?.['@id'], website['@id'], local + ' website reference');
  if (!slug) {
    assert.equal(graph.filter(node => node['@type'] === 'BreadcrumbList').length, 0, local + ' homepage has no invented breadcrumb');
    return;
  }
  const breadcrumb = nodeOf('BreadcrumbList');
  assert.equal(breadcrumb['@id'], before.canonical + '#breadcrumb', local + ' breadcrumb ID');
  assert.equal(page.breadcrumb?.['@id'], breadcrumb['@id'], local + ' breadcrumb reference');
  const urls = [origin + pathFor(before.lang), ...(slug.startsWith('blogs/') ? [origin + pathFor(before.lang, 'blogs')] : []), before.canonical];
  assert.ok(Array.isArray(breadcrumb.itemListElement), local + ' breadcrumb items');
  assert.deepEqual(breadcrumb.itemListElement.map(item => item.item), urls, local + ' breadcrumb hierarchy');
  const markup = visible.match(/<nav\b[^>]*class="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
  const displayed = [...markup.matchAll(/<(a|span)\b([^>]*)>([\s\S]*?)<\/\1>/g)]
    .map(([, tag, attrs, label]) => ({ tag, ...attributes(attrs), label: text(label) }))
    .filter(item => item['aria-hidden'] !== 'true');
  assert.equal(displayed.length, urls.length, local + ' visible breadcrumb hierarchy');
  breadcrumb.itemListElement.forEach((item, index) => {
    assert.equal(item['@type'], 'ListItem', local + ' breadcrumb item type');
    assert.equal(item.position, index + 1, local + ' breadcrumb position');
    assert.ok(typeof item.name === 'string' && item.name.trim(), local + ' breadcrumb name');
    assert.ok(displayed[index].label, local + ' visible breadcrumb label');
    if (index < urls.length - 1) assert.equal(new URL(displayed[index].href, before.canonical).href, item.item, local + ' visible breadcrumb link');
    else assert.equal(displayed[index]['aria-current'], 'page', local + ' current breadcrumb');
  });
}

const baseline = JSON.parse(await readFile(join(root, 'data', 'seo-baseline.json'), 'utf8'));
const originals = baseline.routes;
assert.equal(originals.length, 190, 'Unexpected existing route inventory');
assert.equal(new Set(originals.map(route => route.file)).size, 190, 'Duplicate baseline route');
const expected = new Set();
const titles = new Set();
const descriptions = new Set();
const idsByPath = new Map();
for (const before of originals) {
  const local = before.file;
  expected.add(local);
  const after = await readFile(join(root, 'out', local), 'utf8');
  const visible = visibleHtml(after);
  const pageTitle = title(after).trim();
  const description = meta(after, 'description')?.trim();
  assert.ok(pageTitle && !titles.has(pageTitle), local + ' nonempty unique title');
  assert.ok(description && !descriptions.has(description), local + ' nonempty unique description');
  titles.add(pageTitle);
  descriptions.add(description);
  assert.equal(tags(after, 'link').filter(tag => tag.rel === 'canonical').length, 1, local + ' single canonical');
  assert.equal(canonical(after), before.canonical, local + ' canonical');
  assert.deepEqual(alternates(after), before.alternates, local + ' language alternates');
  const featurePath = local.replace(/^(?:es|fr|it|nl|pt|ru|ur|ar|hi)\//, '');
  const slug = featurePath.replace(/(?:^|\/)index\.html$/, '');
  assert.deepEqual(alternates(after), [...SUPPORTED_LOCALES.map(code => code + ':' + origin + pathFor(code, slug)), 'x-default:' + origin + pathFor('en', slug)].sort(), local + ' complete same-page language alternates');
  assert.equal(title(after), before.title, local + ' title');
  for (const key of ['description', 'og:title', 'og:description', 'og:url', 'twitter:title', 'twitter:description']) {
    assert.equal(meta(after, key), before.meta[key] ?? undefined, local + ' ' + key);
  }
  const htmlTag = tags(after, 'html')[0];
  assert.equal(htmlTag.lang, before.lang, local + ' language');
  assert.equal(htmlTag.dir, before.dir ?? undefined, local + ' direction');
  assert.ok(SUPPORTED_LOCALES.includes(htmlTag.lang), local + ' supported HTML language');
  assert.equal(htmlTag.dir, ['ar', 'ur'].includes(htmlTag.lang) ? 'rtl' : 'ltr', local + ' language direction');
  for (const tag of tags(after, 'meta').filter(tag => /^(?:robots|googlebot|bingbot)$/i.test(tag.name || ''))) {
    assert.doesNotMatch(tag.content || '', /\b(?:noindex|none)\b/i, local + ' public page remains indexable');
  }
  const icon = tags(after, 'link').filter(tag => tag.rel === 'icon');
  assert.equal(icon.length, 1, local + ' single icon');
  assert.equal(icon[0].href, '/' + site.favicon + '?v=20261017', local + ' favicon');
  assert.match(after, /<h1[\s>]/, local + ' initial HTML content');
  const headings = [...visible.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(([, level, label]) => ({ level: Number(level), label: text(label) }));
  assert.equal(headings.filter(heading => heading.level === 1).length, 1, local + ' exactly one H1');
  let previousLevel = 0;
  for (const heading of headings) {
    assert.ok(heading.label, local + ' nonempty heading');
    assert.ok(heading.level <= previousLevel + 1, local + ' heading hierarchy H' + previousLevel + ' to H' + heading.level);
    previousLevel = heading.level;
  }
  const ids = identifiers(visible);
  assert.equal(new Set(ids).size, ids.length, local + ' unique HTML IDs');
  idsByPath.set(new URL(before.canonical).pathname, new Set(ids));
  for (const image of tags(visible, 'img')) {
    assert.ok(Object.hasOwn(image, 'alt'), local + ' image alt attribute');
    assert.ok(Number(image.width) > 0 && Number(image.height) > 0, local + ' image dimensions');
  }

  const navigation = loadDictionary(before.lang).nav;
  const menu = visible.match(/<nav\b[^>]*\bid="site-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
  const menuLinks = [...menu.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .map(([, attrs, label]) => ({ ...attributes(attrs), label: text(label.replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')) }));
  for (const [index, key] of ['reseller-panel', 'movies', 'shop'].entries()) {
    assert.equal(navigation[key], truthfulLabels[before.lang][index], local + ' truthful localized navigation');
    assert.equal(menuLinks.find(link => new URL(link.href, before.canonical).pathname === pathFor(before.lang, key))?.label, navigation[key], local + ' rendered menu purpose');
  }
  const reference = sourcePages[site.brand]?.[slug];
  if (reference) assert.ok(tags(visible, 'a').some(link => link.href === reference), local + ' official source reference');
  for (const link of tags(visible, 'a')) {
    const url = new URL(link.href, before.canonical);
    if (sourceHosts.has(url.hostname)) {
      assert.equal(url.protocol, 'https:', local + ' HTTPS source');
      assert.ok(!url.username && !url.password && (!url.port || url.port === '443'), local + ' safe source authority');
    }
  }
  if (!slug || slug === 'packages') {
    const cards = tags(visible, 'article').filter(tag => tag.class?.split(/\s+/).includes('plan-card'));
    assert.ok(cards.length > 0, local + ' server-rendered plans remain visible');
    assert.equal(tags(visible, 'a').filter(tag => tag.class?.split(/\s+/).includes('plan-cta')).length, 0, local + ' no unverified checkout anchor');
    const disabled = tags(visible, 'button').filter(tag => tag.class?.split(/\s+/).includes('plan-cta'));
    assert.equal(disabled.length, cards.length, local + ' disabled checkout per initial plan');
    for (const button of disabled) {
      assert.ok(Object.hasOwn(button, 'disabled'), local + ' checkout waits for a fresh price');
      assert.equal(button['aria-describedby'], 'catalog-status', local + ' checkout status explanation');
    }
  }
  assert.match(after, /\/_next\/static\//, local + ' Next assets');
  assert.doesNotMatch(after, /src="\/app\.js/, local + ' must not execute legacy DOM script');
  assert.doesNotMatch(after, /class="[^"]*\bpublic-navigation\b/, local + ' duplicate Explore bar');
  assert.match(after, /<script type="application\/ld\+json">/, local + ' structured data');
  const json = after.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(JSON.parse(json)['@graph']?.some(node => node['@type'] === 'WebPage' && node.url === before.canonical), local + ' schema URL');
  verifySchema(after, visible, before, slug);
  for (const payload of ['index.txt', '__next._full.txt', '__next._tree.txt', '__next.$oc$segments/__PAGE__.txt']) {
    let rsc;
    try {
      rsc = await readFile(join(root, 'out', dirname(local), payload), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT' || payload !== '__next.$oc$segments/__PAGE__.txt') throw error;
      rsc = await readFile(join(root, 'out', dirname(local), '__next.$oc$segments.__PAGE__.txt'), 'utf8');
    }
    assert.ok(rsc.trim().length > 0, local + ' nonempty React Server Component payload: ' + payload);
    assert.match(rsc, /^[\da-f]+:/m, local + ' React Server Component payload: ' + payload);
    assert.doesNotMatch(rsc, /^\s*(?:<!doctype\s+html|<html\b)/i, local + ' payload must not be an HTML fallback');
  }
  for (const link of tags(visible, 'a')) {
    assert.ok(link.href?.trim(), local + ' nonempty link destination');
    const url = new URL(link.href, before.canonical);
    if (url.origin !== origin) continue;
    const path = url.pathname;
    const target = path.endsWith('/') ? path + 'index.html' : path;
    await access(join(root, 'out', decodeURIComponent(target))).catch(() => { throw new Error(local + ' broken internal link: ' + path); });
    if (url.hash) {
      if (!idsByPath.has(path)) idsByPath.set(path, new Set(identifiers(visibleHtml(await readFile(join(root, 'out', decodeURIComponent(target)), 'utf8')))));
      assert.ok(idsByPath.get(path).has(decodeURIComponent(url.hash.slice(1))), local + ' broken internal fragment: ' + link.href);
    }
  }
}
const exported = await collect(join(root, 'out'));
const actual = new Set(exported.map(file => relative(join(root, 'out'), file).replaceAll('\\', '/')).filter(file => !['404.html', '404/index.html', '_not-found.html', '_not-found/index.html'].includes(file)));
assert.deepEqual([...actual].sort(), [...expected].sort(), 'Export route inventory changed');
for (const asset of ['robots.txt', 'sitemap.xml', site.favicon]) {
  const original = await readFile(join(root, asset));
  assert.ok(original.equals(await readFile(join(root, 'public', asset))), asset + ' public copy changed');
  assert.ok(original.equals(await readFile(join(root, 'out', asset))), asset + ' exported copy changed');
}
const sitemap = await readFile(join(root, 'out', 'sitemap.xml'), 'utf8');
assert.equal([...sitemap.matchAll(/<loc>/g)].length, 190, 'Sitemap page count');
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => decode(url)).sort(), originals.map(route => route.canonical).sort(), 'Sitemap matches canonical route inventory');
assert.equal(SUPPORTED_LOCALES.length, 10);
assert.equal(centralUrl('https://example.net/checkout'), null, 'Foreign checkout blocked');
assert.equal(checkoutUrl(-1, site.source), null, 'Invalid package blocked');
assert.match(checkoutUrl(148, site.source), new RegExp('utm_source=' + site.source));
assert.match(newRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(availablePlans([{ id: 1, type: 'iptv', is_available: false, price_amount: 9, duration_months: 1, currency: 'USD' }]).length, 0);
for (const component of ['SiteHeader', 'SiteFooter', 'HomePage', 'ContentPage']) {
  const source = await readFile(join(root, 'components', component + '.jsx'), 'utf8');
  assert.match(source, /import\s+Link\s+from\s+['"]next\/link['"]/, component + ' Next Link import');
  assert.match(source, /<Link\b/, component + ' client-side navigation');
  assert.doesNotMatch(source, /<a\b[^>]*\bhref=\{pathFor\(/, component + ' internal page navigation must use Next Link');
  assert.doesNotMatch(source, /(?:window\.)?location\.(?:assign|replace|reload)\s*\(|(?:window\.)?location(?:\.href)?\s*=/, component + ' must not force document navigation');
}
for (const component of ['ConsentProvider', 'Catalog', 'SupportWidget']) {
  const source = await readFile(join(root, 'components', component + '.jsx'), 'utf8');
  assert.match(source, /usePathname/, component + ' must react to client route changes');
}

const catalogSource = await readFile(join(root, 'components', 'Catalog.jsx'), 'utf8');
assert.doesNotMatch(catalogSource, /packages:\s*\[\]/, 'Catalog must not clear validated reference cards during refresh');
assert.match(catalogSource, /verifiedRequest === requestKey && !loading && !error/, 'Checkout must be bound to the current verified request');
assert.match(catalogSource, /setVerifiedRequest\(data\.packages\.length \? requestKey : null\)/, 'Only fresh valid plans authorize checkout');
assert.match(catalogSource, /type="button" disabled/, 'Unverified checkout is a disabled button');
for (const legacy of [...originals.map(route => route.file), 'app.js', 'build-locales.mjs', 'build-pages.mjs']) {
  await assert.rejects(() => access(join(root, legacy)), { code: 'ENOENT' }, 'Legacy setup remains: ' + legacy);
}
const originalFetch = globalThis.fetch;
let calls = 0;
try {
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } }); };
  assert.equal((await postLanding('leads', { brand: site.brand })).ok, true);
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ ok: false }), { status: 200 }); };
  await assert.rejects(() => postLanding('leads', { brand: site.brand }));
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ errors: { email: ['Invalid'] } }), { status: 422 }); };
  await assert.rejects(() => postLanding('leads', { brand: site.brand }), error => error.status === 422 && !!error.fields?.email);
} finally { globalThis.fetch = originalFetch; }
console.log(site.domain + ': 190 Next routes, 10 languages, metadata/hreflang/schema, all internal links, Next Link source, 760 RSC payloads, legacy removal and unchanged sitemap/robots/favicon verified. ' + calls + ' mocked form responses checked; no real submissions.');
