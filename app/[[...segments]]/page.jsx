import { cache } from 'react';
import { notFound } from 'next/navigation';
import { site, SUPPORTED_LOCALES, pathFor, resolveRoute } from '../../lib/site.js';
import { loadDictionary, homeMetadata } from '../../lib/i18n.js';
import SiteHeader from '../../components/SiteHeader.jsx';
import SiteFooter from '../../components/SiteFooter.jsx';
import HomePage from '../../components/HomePage.jsx';
import ContentPage from '../../components/ContentPage.jsx';
import BlogArticle from '../../components/BlogArticle.jsx';
import BlogListing from '../../components/BlogListing.jsx';
import { readBlogSnapshot, blogRouteSlugs, resolveBlogRoute, blogPageCount, blogSummaries, blogArchiveTitle } from '../../lib/blogs.js';
import { CatalogProvider } from '../../components/Catalog.jsx';
import ConsentProvider from '../../components/ConsentProvider.jsx';
import SupportWidget, { SupportProvider } from '../../components/SupportWidget.jsx';

export const dynamicParams = false;
const origin = 'https://' + site.domain;
const serverApi = process.env.LANDING_API_ORIGIN || 'https://opplexiptv.com';
const kinds = ['editorial', 'packages', 'contact', 'activation', 'blogs', 'article'];

const readApi = cache(async path => {
  const base = new URL(serverApi);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid public API origin');
  const response = await fetch(new URL('/api/v1/site/' + path, base), { headers: { Accept: 'application/json' }, cache: 'force-cache', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Public content API returned ' + response.status);
  const body = await response.json();
  if (!body?.data || typeof body.data !== 'object') throw new Error('Invalid public data');
  return body.data;
});
const pagesFor = cache(async locale => {
  const data = await readApi('brands/' + site.brand + '/pages?locale=' + locale);
  if (data.brand !== site.brand || data.locale !== locale || !Array.isArray(data.pages) || data.pages.length !== 18 || !data.labels) throw new Error('Unexpected public page inventory');
  const slugs = new Set();
  for (const page of data.pages) {
    if (!page || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(page.slug) || slugs.has(page.slug) || !kinds.includes(page.kind) ||
      ['pricing', 'iptv-subscription-service'].includes(page.slug) || !['title', 'description', 'intro'].every(key => typeof page[key] === 'string' && page[key].trim()) ||
      !Array.isArray(page.sections) || !page.sections.length || !page.sections.every(row => typeof row.heading === 'string' && typeof row.body === 'string')) throw new Error('Invalid public page');
    slugs.add(page.slug);
  }
  if (data.pages.filter(page => page.kind === 'packages').length !== 1) throw new Error('Duplicate packages pages');
  return data;
});
const contentFor = cache(async locale => {
  const data = await readApi('brands/' + site.brand + '/content?locale=' + locale);
  if (data.brand !== site.brand || data.locale !== locale || !data.content?.hero_heading || !data.content?.guide_sections?.length || !data.provider_name) throw new Error('Invalid brand content');
  return data;
});

const blogSnapshotFor = cache(readBlogSnapshot);

export async function generateStaticParams() {
  const routes = [];
  const snapshot = blogSnapshotFor();
  let inventory;
  for (const locale of SUPPORTED_LOCALES) {
    const data = await pagesFor(locale);
    const current = data.pages.map(page => page.slug + ':' + page.kind).sort().join('|');
    if (inventory && inventory !== current) throw new Error('Language route mismatch');
    inventory = current;
    for (const slug of ['', ...data.pages.map(page => page.slug), ...blogRouteSlugs(snapshot)]) {
      routes.push({ segments: [...(locale === 'en' ? [] : [locale]), ...(slug ? slug.split('/') : [])] });
    }
  }
  return routes;
}

export async function generateMetadata({ params }) {
  const { locale, slug } = resolveRoute((await params).segments);
  const data = await pagesFor(locale);
  const snapshot = blogSnapshotFor();
  const cms = resolveBlogRoute(snapshot, slug);
  const page = slug ? data.pages.find(item => item.slug === slug) : null;
  const archive = cms.page !== null && cms.page > 1;
  if (slug && !page && !cms.post && !archive) notFound();
  const original = homeMetadata(locale);
  const translation = cms.post?.translations[locale];
  const title = translation?.seo_title || (archive ? blogArchiveTitle(snapshot, locale, cms.page) : page?.title || original.title);
  const description = translation?.seo_description || (archive ? data.pages.find(item => item.slug === 'blogs').description + ' ' + snapshot.labels[locale].pageLabel.replace('{page}', String(cms.page)) : page?.description || original.description);
  const url = origin + pathFor(locale, slug);
  return {
    metadataBase: new URL(origin), title, description,

    alternates: { canonical: url, languages: Object.fromEntries([...SUPPORTED_LOCALES.map(code => [code, origin + pathFor(code, slug)]), ['x-default', origin + pathFor('en', slug)]]) },
    openGraph: { type: cms.post ? 'article' : 'website', ...(cms.post ? { publishedTime: cms.post.published_at, modifiedTime: cms.post.updated_at } : {}), siteName: site.name, url, title: cms.post || archive || page ? title : original.ogTitle, description: cms.post || archive || page ? description : original.ogDescription, locale, images: [{ url: origin + '/share-card.png', width: 1200, height: 630, alt: site.name }] },
    twitter: { card: 'summary_large_image', title: cms.post || archive || page ? title : original.twitterTitle, description: cms.post || archive || page ? description : original.twitterDescription, images: [origin + '/share-card.png'] },
    icons: { icon: { url: '/' + site.favicon + '?v=20261017', type: site.favicon.endsWith('.svg') ? 'image/svg+xml' : 'image/webp', ...(site.favicon.endsWith('.svg') ? { sizes: 'any' } : {}) } },
  };
}

export default async function Page({ params }) {
  const { locale, slug } = resolveRoute((await params).segments);
  const [data, initialData] = await Promise.all([pagesFor(locale), contentFor(locale)]);
  const snapshot = blogSnapshotFor();
  const cms = resolveBlogRoute(snapshot, slug);
  const page = slug ? data.pages.find(item => item.slug === slug) : null;
  const archive = cms.page !== null && cms.page > 1;
  if (slug && !page && !cms.post && !archive) notFound();
  const { text, ui, nav } = loadDictionary(locale);
  const initialDevices = !slug ? (await readApi('configure?locale=' + locale)).devices || [] : [];
  const url = origin + pathFor(locale, slug);
  const translation = cms.post?.translations[locale];
  const archiveTitle = archive ? blogArchiveTitle(snapshot, locale, cms.page) : null;
  const heading = translation?.title || archiveTitle || page?.title;
  const title = translation?.seo_title || archiveTitle || page?.title;
  const description = translation?.seo_description || (archive ? data.pages.find(item => item.slug === 'blogs').description + ' ' + snapshot.labels[locale].pageLabel.replace('{page}', String(cms.page)) : page?.description);
  const article = Boolean(cms.post) || page?.kind === 'article';
  const schema = page || cms.post || archive ? { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: site.name, inLanguage: SUPPORTED_LOCALES },
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description, inLanguage: locale, isPartOf: { '@id': origin + '/#website' }, breadcrumb: { '@id': url + '#breadcrumb' } },
    { '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
      { '@type': 'ListItem', position: 1, name: data.labels.home, item: origin + pathFor(locale) },
      ...(article || archive ? [{ '@type': 'ListItem', position: 2, name: nav.blogs, item: origin + pathFor(locale, 'blogs') }] : []),
      { '@type': 'ListItem', position: article || archive ? 3 : 2, name: heading, item: url },
    ] },
    ...(cms.post ? [{ '@type': 'BlogPosting', '@id': url + '#article', headline: translation.title, description: translation.seo_description,
      mainEntityOfPage: { '@id': url + '#webpage' }, datePublished: cms.post.published_at, dateModified: cms.post.updated_at,
      author: { '@type': cms.post.author.type, name: cms.post.author.name }, publisher: { '@type': cms.post.author.type, name: cms.post.author.name },
      image: [cms.post.image], inLanguage: locale }] : []),
  ] } : homeMetadata(locale).schema;
  const props = { site, locale, text, ui: { ...ui, retry: data.labels.retry }, nav, labels: data.labels, pageSlug: slug, experienceUi: initialData.experience?.ui || {} };
  const listing = { locale, labels: snapshot.labels[locale], page: cms.page || 1, pageCount: blogPageCount(snapshot),
    items: blogSummaries(snapshot, locale, cms.page || 1) };
  return <ConsentProvider {...props}>
    <CatalogProvider site={site} locale={locale} initialData={initialData} initialDevices={initialDevices} withDevices={!slug}>
      <SupportProvider {...props}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
        <SiteHeader {...props} slug={slug} />
        {cms.post ? <BlogArticle site={site} locale={locale} post={cms.post} labels={snapshot.labels[locale]} nav={nav}
          relatedPages={data.pages.filter(item => ['setup', 'iptv-applications', 'faqs'].includes(item.slug))} />
          : archive ? <BlogListing {...listing} mode="archive" title={archiveTitle} nav={nav} />
          : page ? <ContentPage {...props} page={page} pages={data.pages} cmsBlogListing={slug === 'blogs' ? listing : null} />
          : <HomePage {...props} pages={data.pages} cmsLatestBlogs={{ ...listing, items: blogSummaries(snapshot, locale, 1, 3) }} />}
        <SiteFooter {...props} />
        <SupportWidget {...props} />
      </SupportProvider>
    </CatalogProvider>
  </ConsentProvider>;
}
