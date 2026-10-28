import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { site } from '../lib/site.js';
import { BLOG_SNAPSHOT_PATH, validateBlogSnapshot } from '../lib/blogs.js';

const maximumBytes = 64 * 1024 * 1024;
let snapshot;
if (process.env.BLOG_BUILD_SNAPSHOT_PATH) {
  const source = process.env.BLOG_BUILD_SNAPSHOT_PATH;
  assert.ok((await stat(source)).size <= maximumBytes, 'Build snapshot is too large');
  snapshot = JSON.parse(await readFile(source, 'utf8'));
} else {
  const base = new URL(process.env.LANDING_API_ORIGIN || 'https://opplexiptv.com');
  assert.ok(['https:', 'http:'].includes(base.protocol) && !base.username && !base.password
    && (base.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)), 'Safe blog API origin');
  let initial, lastPage = 1, expectedTotal = 0;
  const posts = [];
  for (let page = 1; page <= lastPage; page++) {
    const url = new URL('/api/v1/site/brands/' + site.brand + '/blogs', base);
    url.searchParams.set('page', String(page)); url.searchParams.set('per_page', '25');
    if (initial) url.searchParams.set('revision', initial.revision);
    const response = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, response.status === 409 ? 'Blog revision changed during pagination; retry a fresh build' : 'Blog API returned HTTP ' + response.status);
    const source = await response.text();
    assert.ok(Buffer.byteLength(source) <= 8 * 1024 * 1024, 'Blog API page is too large');
    const body = JSON.parse(source), data = body?.data;
    assert.ok(data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.posts), 'Blog API envelope');
    const { pagination, posts: pagePosts, ...identity } = data;
    assert.ok(pagination && Number.isSafeInteger(pagination.total) && pagination.total >= 0
      && pagination.current_page === page && pagination.per_page === 25
      && pagination.last_page === Math.max(1, Math.ceil(pagination.total / 25)), 'Blog API pagination');
    if (!initial) {
      initial = identity; lastPage = pagination.last_page; expectedTotal = pagination.total;
      assert.ok(expectedTotal <= 5000, 'Blog inventory exceeds one sitemap');
    } else assert.ok(isDeepStrictEqual(identity, initial) && pagination.last_page === lastPage && pagination.total === expectedTotal, 'Blog snapshot changed during pagination');
    assert.equal(pagePosts.length, Math.min(25, expectedTotal - (page - 1) * 25), 'Complete blog API page');
    posts.push(...pagePosts);
  }
  assert.equal(posts.length, expectedTotal, 'Complete blog snapshot');
  snapshot = { ...initial, posts };
}
validateBlogSnapshot(snapshot);
const json = JSON.stringify(snapshot);
assert.ok(Buffer.byteLength(json) <= maximumBytes, 'Blog build snapshot is too large');
await mkdir(dirname(BLOG_SNAPSHOT_PATH), { recursive: true });
await writeFile(BLOG_SNAPSHOT_PATH, json + '\n', { mode: 0o600 });
console.log(site.domain + ': validated blog build snapshot; posts=' + snapshot.posts.length + '; revision=' + snapshot.revision);
