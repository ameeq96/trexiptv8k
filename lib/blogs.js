import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { site, SUPPORTED_LOCALES, pathFor } from './site.js';

export const BLOG_PAGE_SIZE = 12;
export const BLOG_SNAPSHOT_PATH = join(process.cwd(), 'data', '.generated', 'blogs.json');
const labelKeys = ['latestArticles', 'blogArchive', 'readArticle', 'previousPage', 'nextPage', 'publishedOn', 'pageLabel'];
const hash = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys, name) => {
  assert.ok(object(value), name + ' must be an object');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), name + ' fields');
};
const plainText = (value, name, maximum = 6000) => {
  assert.ok(typeof value === 'string' && value.trim() && value.length <= maximum
    && !/<\/?[a-z][^>]*>/i.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), name + ' must be bounded plain text');
};
const isoDate = (value, name) => {
  assert.ok(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), name + ' must be an ISO date');
};
export function referenceUrl(value) {
  assert.ok(typeof value === 'string' && value.length <= 2048, 'Reference URL length');
  const url = new URL(value);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443'), 'Reference must use HTTPS without credentials');
  return url.href;
}
function legacySlugs() {
  const baseline = JSON.parse(readFileSync(join(process.cwd(), 'data', 'seo-baseline.json'), 'utf8'));
  return new Set(baseline.routes.map(row => new URL(row.canonical).pathname).map(path => path.match(/^\/blogs\/([^/]+)\/$/)?.[1]).filter(Boolean));
}
export function validateBlogSnapshot(input) {
  exactKeys(input, ['version', 'site_key', 'domain', 'revision', 'locales', 'labels', 'posts'], 'Blog snapshot');
  assert.equal(input.version, 1, 'Blog snapshot version');
  assert.equal(input.site_key, site.brand, 'Blog snapshot brand');
  assert.equal(input.domain, site.domain, 'Blog snapshot domain');
  assert.match(input.revision, hash, 'Blog snapshot revision');
  assert.deepEqual(input.locales, SUPPORTED_LOCALES, 'Blog locales');
  exactKeys(input.labels, SUPPORTED_LOCALES, 'Blog label locales');
  for (const locale of SUPPORTED_LOCALES) {
    exactKeys(input.labels[locale], labelKeys, 'Blog labels');
    for (const key of labelKeys) plainText(input.labels[locale][key], locale + ':' + key, 200);
    assert.equal(input.labels[locale].pageLabel.split('{page}').length, 2, 'Page label must contain one {page}');
  }
  assert.ok(Array.isArray(input.posts), 'Blog posts must be an array');
  const ids = new Set(), slugs = legacySlugs(), revisions = new Set();
  for (const post of input.posts) {
    exactKeys(post, ['id', 'slug', 'revision', 'published_at', 'updated_at', 'author', 'image', 'translations'], 'Blog post');
    assert.ok(Number.isSafeInteger(post.id) && post.id > 0 && !ids.has(post.id), 'Unique positive blog ID'); ids.add(post.id);
    assert.ok(typeof post.slug === 'string' && post.slug.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)
      && post.slug !== 'page' && !slugs.has(post.slug), 'Unique non-legacy blog slug'); slugs.add(post.slug);
    assert.match(post.revision, hash, 'Blog post revision');
    assert.ok(!revisions.has(post.revision), 'Unique blog post revision'); revisions.add(post.revision);
    isoDate(post.published_at, 'Publication date'); isoDate(post.updated_at, 'Modification date');
    exactKeys(post.author, ['type', 'name'], 'Blog author');
    assert.deepEqual(post.author, { type: 'Organization', name: 'Opplex IPTV Subscription Services' }, 'Actual editorial organization');
    assert.equal(post.image, 'https://' + site.domain + '/share-card.png', 'Own blog image');
    exactKeys(post.translations, SUPPORTED_LOCALES, 'Blog translations');
    for (const locale of SUPPORTED_LOCALES) {
      const translation = post.translations[locale];
      exactKeys(translation, ['title', 'excerpt', 'seo_title', 'seo_description', 'sections'], 'Blog translation');
      plainText(translation.title, 'Blog title', 200); plainText(translation.excerpt, 'Blog excerpt', 1200);
      plainText(translation.seo_title, 'Blog SEO title', 200); plainText(translation.seo_description, 'Blog description', 600);
      assert.ok(Array.isArray(translation.sections) && translation.sections.length > 0 && translation.sections.length <= 30, 'Blog sections');
      for (const section of translation.sections) {
        exactKeys(section, ['heading', 'paragraphs', 'items', 'links'], 'Blog section');
        plainText(section.heading, 'Section heading', 300);
        for (const key of ['paragraphs', 'items', 'links']) assert.ok(Array.isArray(section[key]) && section[key].length <= 30, 'Section ' + key);
        assert.ok(section.paragraphs.length + section.items.length + section.links.length > 0, 'Nonempty blog section');
        for (const paragraph of section.paragraphs) plainText(paragraph, 'Blog paragraph');
        for (const item of section.items) plainText(item, 'Blog list item', 3000);
        for (const link of section.links) {
          exactKeys(link, ['label', 'url'], 'Blog reference'); plainText(link.label, 'Reference label', 300); referenceUrl(link.url);
        }
      }
    }
  }
  assert.ok(190 + input.posts.length * SUPPORTED_LOCALES.length
    + Math.max(0, Math.ceil(input.posts.length / BLOG_PAGE_SIZE) - 1) * SUPPORTED_LOCALES.length <= 50000, 'Blog export exceeds one sitemap; stop and review');
  return input;
}
let remembered;
export function readBlogSnapshot() {
  const info = statSync(BLOG_SNAPSHOT_PATH);
  const signature = info.mtimeMs + ':' + info.size;
  if (remembered?.signature !== signature) {
    remembered = { signature, snapshot: validateBlogSnapshot(JSON.parse(readFileSync(BLOG_SNAPSHOT_PATH, 'utf8'))) };
  }
  return remembered.snapshot;
}
export function orderedBlogPosts(snapshot) {
  return [...snapshot.posts].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || b.id - a.id);
}
export function blogPageCount(snapshot) { return Math.max(1, Math.ceil(snapshot.posts.length / BLOG_PAGE_SIZE)); }
export function blogArchiveSlug(page) { return page === 1 ? 'blogs' : 'blogs/page/' + page; }
export function blogRouteSlugs(snapshot) {
  return [...snapshot.posts.map(post => 'blogs/' + post.slug),
    ...Array.from({ length: blogPageCount(snapshot) - 1 }, (_, index) => blogArchiveSlug(index + 2))];
}
export function resolveBlogRoute(snapshot, slug) {
  const article = /^blogs\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(slug);
  if (article) {
    const post = snapshot.posts.find(item => item.slug === article[1]);
    if (post) return { post, page: null };
  }
  const archive = /^blogs\/page\/([1-9]\d*)$/.exec(slug);
  const page = archive ? Number(archive[1]) : slug === 'blogs' ? 1 : null;
  return { post: null, page: Number.isSafeInteger(page) && page >= 1 && page <= blogPageCount(snapshot) && (slug === 'blogs' || page >= 2) ? page : null };
}
export function blogSummaries(snapshot, locale, page = 1, limit = BLOG_PAGE_SIZE) {
  return orderedBlogPosts(snapshot).slice((page - 1) * BLOG_PAGE_SIZE, (page - 1) * BLOG_PAGE_SIZE + limit)
    .map(post => ({ id: post.id, slug: post.slug, revision: post.revision, published_at: post.published_at,
      title: post.translations[locale].title, excerpt: post.translations[locale].excerpt }));
}
export function blogArchiveTitle(snapshot, locale, page) {
  return snapshot.labels[locale].blogArchive + ' — ' + snapshot.labels[locale].pageLabel.replace('{page}', String(page));
}
export function blogPublicRoutes(snapshot) {
  return SUPPORTED_LOCALES.flatMap(locale => [
    ...snapshot.posts.map(post => ({ locale, slug: 'blogs/' + post.slug, post, canonical: 'https://' + site.domain + pathFor(locale, 'blogs/' + post.slug) })),
    ...Array.from({ length: blogPageCount(snapshot) - 1 }, (_, index) => ({ locale, slug: blogArchiveSlug(index + 2), page: index + 2,
      canonical: 'https://' + site.domain + pathFor(locale, blogArchiveSlug(index + 2)) })),
  ]);
}
