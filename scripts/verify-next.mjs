import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { site, SUPPORTED_LOCALES } from '../lib/site.js';
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

const baseline = JSON.parse(await readFile(join(root, 'data', 'seo-baseline.json'), 'utf8'));
const originals = baseline.routes;
assert.equal(originals.length, 190, 'Unexpected existing route inventory');
assert.equal(new Set(originals.map(route => route.file)).size, 190, 'Duplicate baseline route');
const expected = new Set();
for (const before of originals) {
  const local = before.file;
  expected.add(local);
  const after = await readFile(join(root, 'out', local), 'utf8');
  assert.equal(canonical(after), before.canonical, local + ' canonical');
  assert.deepEqual(alternates(after), before.alternates, local + ' language alternates');
  assert.equal(title(after), before.title, local + ' title');
  for (const key of ['description', 'og:title', 'og:description', 'og:url', 'twitter:title', 'twitter:description']) {
    assert.equal(meta(after, key), before.meta[key] ?? undefined, local + ' ' + key);
  }
  const htmlTag = tags(after, 'html')[0];
  assert.equal(htmlTag.lang, before.lang, local + ' language');
  assert.equal(htmlTag.dir, before.dir ?? undefined, local + ' direction');
  const icon = tags(after, 'link').filter(tag => tag.rel === 'icon');
  assert.equal(icon.length, 1, local + ' single icon');
  assert.equal(icon[0].href, '/' + site.favicon + '?v=20261017', local + ' favicon');
  assert.match(after, /<h1[\s>]/, local + ' initial HTML content');
  assert.match(after, /\/_next\/static\//, local + ' Next assets');
  assert.doesNotMatch(after, /src="\/app\.js/, local + ' must not execute legacy DOM script');
  assert.doesNotMatch(after, /class="[^"]*\bpublic-navigation\b/, local + ' duplicate Explore bar');
  assert.match(after, /<script type="application\/ld\+json">/, local + ' structured data');
  const json = after.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(JSON.parse(json)['@graph']?.some(node => node['@type'] === 'WebPage' && node.url === before.canonical), local + ' schema URL');
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
  for (const link of tags(after, 'a')) {
    if (!link.href?.startsWith('/') || link.href.startsWith('//')) continue;
    const path = new URL(link.href, 'https://' + site.domain).pathname;
    const target = path.endsWith('/') ? path + 'index.html' : path;
    await access(join(root, 'out', decodeURIComponent(target))).catch(() => { throw new Error(local + ' broken internal link: ' + path); });
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
