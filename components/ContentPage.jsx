'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Catalog from './Catalog';
import { SupportSection } from './HomePage';
import { useSupport } from './SupportWidget';
import { pathFor } from '../lib/site';
import { centralUrl } from '../lib/api';

export default function ContentPage({ site, locale, page, pages = [], labels = {}, ui = {}, text = {}, nav = {} }) {
  const { openContact } = useSupport();
  const [origin, setOrigin] = useState('https://opplexiptv.com');
  useEffect(() => { setOrigin(new URL(centralUrl('/account', site.source)).origin); }, [site.source]);
  const policy = ['terms-of-service', 'privacy-policy', 'refund-policy'].includes(page.slug);
  const articles = pages.filter(item => item.kind === 'article');
  const isPackages = page.kind === 'packages';
  const [playlistGuide, playbackGuide, supportGuide] = articles;
  const relatedSlugs = page.kind === 'article' ? ['iptv-applications', ...articles.map(item => item.slug)] : {
    setup: ['iptv-applications', playbackGuide?.slug, supportGuide?.slug],
    'iptv-applications': [playbackGuide?.slug, playlistGuide?.slug, 'faqs'],
    faqs: ['iptv-applications', playbackGuide?.slug, supportGuide?.slug],
  }[page.slug] || [];
  const relatedPages = [...new Set(relatedSlugs)].filter(slug => slug !== page.slug)
    .map(slug => pages.find(item => item.slug === slug)).filter(Boolean).slice(0, 3);

  return <main id="main" className={'content-page page-' + page.kind}>
    <div className="container">
      <nav className="breadcrumb" aria-label={labels.pages}><Link href={pathFor(locale)}>{nav.home || labels.home}</Link><span aria-hidden="true">/</span>{page.kind === 'article' && <><Link href={pathFor(locale, 'blogs')}>{nav.blogs}</Link><span aria-hidden="true">/</span></>}<span aria-current="page">{nav[page.slug] || page.title}</span></nav>
      <header className="page-heading"><p className="eyebrow">{nav[page.slug] || labels.guide}</p><h1>{page.title}</h1><p className="page-intro">{page.intro}</p></header>
      {isPackages && <section className="page-catalog" aria-label={labels.packages}><Catalog site={site} locale={locale} ui={ui} labels={{ heading: nav.packages || labels.packages, retry: labels.retry }} /></section>}
      <div className="content-layout">
        <article className="page-copy">
          {policy && <aside className="policy-notice"><p>{labels.disclaimer}</p><a href={centralUrl('/' + page.slug, site.source, origin)}>{labels.governingPolicy} — opplexiptv.com <span aria-hidden="true">↗</span></a></aside>}
          {page.sections.map((section, index) => <section className="copy-section" key={section.heading + index} aria-labelledby={'copy-heading-' + index}><span className="section-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h2 id={'copy-heading-' + index}>{section.heading}</h2><p>{section.body}</p>{section.links?.length > 0 && <ul>{section.links.map(link => <li key={link.url}><a className="text-link" href={link.url} rel="noopener noreferrer">{link.label}<span aria-hidden="true">↗</span></a></li>)}</ul>}</div></section>)}
          {relatedPages.length > 0 && <nav className="copy-section" aria-labelledby="related-guides-heading"><span className="section-index" aria-hidden="true">↗</span><div><h2 id="related-guides-heading">{nav.blogs || labels.guide}</h2><ul>{relatedPages.map(related => <li key={related.slug}><Link className="text-link" href={pathFor(locale, related.slug)}>{related.title}<span aria-hidden="true">→</span></Link></li>)}</ul></div></nav>}
          {page.kind === 'contact' && <button type="button" className="button button-primary" onClick={event => openContact('whatsapp', event.currentTarget)}>{labels.contact}<span aria-hidden="true">↗</span></button>}
          {page.kind === 'activation' && <a className="button button-primary" href={centralUrl('/' + (page.slug === 'activate-info' ? 'activate-info' : 'activate'), site.source, origin)}>{nav[page.slug] || page.title}<span aria-hidden="true">↗</span></a>}
          {page.kind === 'article' && <Link className="text-link" href={pathFor(locale, 'blogs')}><span aria-hidden="true">←</span>{labels.backToGuides}</Link>}
        </article>
        <aside className="page-sidebar"><p className="eyebrow">{labels.setup}</p><nav aria-label={labels.pages}><Link href={pathFor(locale, 'packages')}>{labels.choosePlan}<span aria-hidden="true">↗</span></Link><Link href={pathFor(locale, 'setup')}>{labels.setup}<span aria-hidden="true">↗</span></Link><Link href={pathFor(locale, 'contact')}>{labels.contact}<span aria-hidden="true">↗</span></Link><a href={centralUrl('/account', site.source, origin)}>{labels.account}<span aria-hidden="true">↗</span></a></nav></aside>
      </div>
      {page.kind === 'blogs' && <div className="article-grid page-articles">{articles.map((article, index) => <article className="article-card" key={article.slug}><span className="article-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h2><Link href={pathFor(locale, article.slug)}>{article.title}</Link></h2><p>{article.description}</p><Link className="text-link" href={pathFor(locale, article.slug)}>{labels.readMore}<span aria-hidden="true">→</span></Link></article>)}</div>}
    </div>
    <SupportSection site={site} locale={locale} labels={labels} text={text} />
  </main>;
}
