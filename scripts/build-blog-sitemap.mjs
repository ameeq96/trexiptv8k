import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { site, SUPPORTED_LOCALES, pathFor } from '../lib/site.js';
import { readBlogSnapshot, blogPublicRoutes, orderedBlogPosts, BLOG_PAGE_SIZE } from '../lib/blogs.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const snapshot = readBlogSnapshot();
const routes = blogPublicRoutes(snapshot);
assert.match(baseline, /<\/urlset>\s*$/);
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const additions = [];
const posts = orderedBlogPosts(snapshot);
const newest = items => items.reduce((date, post) => !date || Date.parse(post.updated_at) > Date.parse(date) ? post.updated_at : date, '');
let base = baseline;
if (posts.length) {
  const modified = new Map(SUPPORTED_LOCALES.flatMap(locale => [[
    'https://' + site.domain + pathFor(locale), newest(posts.slice(0, 3))], [
    'https://' + site.domain + pathFor(locale, 'blogs'), newest(posts.slice(0, BLOG_PAGE_SIZE))]]));
  base = baseline.replace(/<url>([\s\S]*?)<\/url>/g, (complete, entry) => {
    const url = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!modified.has(url)) return complete;
    const current = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    const date = current && Date.parse(current) > Date.parse(modified.get(url)) ? current : modified.get(url);
    return /<lastmod>/.test(entry) ? complete.replace(/<lastmod>[^<]+<\/lastmod>/, '<lastmod>' + escape(date) + '</lastmod>')
      : complete.replace('</loc>', '</loc><lastmod>' + escape(date) + '</lastmod>');
  });
}
for (const route of routes) {
  await access(root + 'out' + pathFor(route.locale, route.slug) + 'index.html');
  const lastmod = route.post?.updated_at || newest(posts.slice((route.page - 1) * BLOG_PAGE_SIZE, route.page * BLOG_PAGE_SIZE));
  const alternates = [...SUPPORTED_LOCALES.map(locale => [locale, 'https://' + site.domain + pathFor(locale, route.slug)]),
    ['x-default', 'https://' + site.domain + pathFor('en', route.slug)]];
  additions.push('  <url><loc>' + escape(route.canonical) + '</loc><lastmod>' + escape(lastmod) + '</lastmod>'
    + alternates.map(([locale, url]) => '<xhtml:link rel="alternate" hreflang="' + locale + '" href="' + escape(url) + '"/>').join('') + '</url>');
}
const xml = routes.length ? base.replace(/<\/urlset>\s*$/, additions.join('\n') + '\n</urlset>\n') : baseline;
assert.ok([...xml.matchAll(/<loc>/g)].length <= 50000, 'Sitemap URL limit');
await writeFile(new URL('../out/sitemap.xml', import.meta.url), xml);
console.log(site.domain + ': sitemap preserves 190 baseline URLs and adds ' + routes.length + ' CMS blog/archive URLs');
