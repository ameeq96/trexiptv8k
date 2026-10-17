'use client';

import { useEffect, useState } from 'react';
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

  return <main id="main" className={'content-page page-' + page.kind}>
    <div className="container">
      <nav className="breadcrumb" aria-label={labels.pages}><a href={pathFor(locale)}>{nav.home || labels.home}</a><span aria-hidden="true">/</span>{page.kind === 'article' && <><a href={pathFor(locale, 'blogs')}>{nav.blogs}</a><span aria-hidden="true">/</span></>}<span aria-current="page">{nav[page.slug] || page.title}</span></nav>
      <header className="page-heading"><p className="eyebrow">{nav[page.slug] || labels.guide}</p><h1>{page.title}</h1><p className="page-intro">{page.intro}</p></header>
      {isPackages && <section className="page-catalog" aria-label={labels.packages}><Catalog site={site} locale={locale} ui={ui} labels={{ retry: labels.retry }} /></section>}
      <div className="content-layout">
        <article className="page-copy">
          {policy && <aside className="policy-notice"><p>{labels.disclaimer}</p><a href={centralUrl('/' + page.slug, site.source, origin)}>{labels.governingPolicy} — opplexiptv.com <span aria-hidden="true">↗</span></a></aside>}
          {page.sections.map((section, index) => <section className="copy-section" key={section.heading + index} aria-labelledby={'copy-heading-' + index}><span className="section-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h2 id={'copy-heading-' + index}>{section.heading}</h2><p>{section.body}</p></div></section>)}
          {page.kind === 'contact' && <button type="button" className="button button-primary" onClick={event => openContact('whatsapp', event.currentTarget)}>{labels.contact}<span aria-hidden="true">↗</span></button>}
          {page.kind === 'activation' && <a className="button button-primary" href={centralUrl('/' + (page.slug === 'activate-info' ? 'activate-info' : 'activate'), site.source, origin)}>{nav[page.slug] || page.title}<span aria-hidden="true">↗</span></a>}
          {page.kind === 'article' && <a className="text-link" href={pathFor(locale, 'blogs')}><span aria-hidden="true">←</span>{labels.backToGuides}</a>}
        </article>
        <aside className="page-sidebar"><p className="eyebrow">{labels.setup}</p><nav aria-label={labels.pages}><a href={pathFor(locale, 'packages')}>{labels.choosePlan}<span aria-hidden="true">↗</span></a><a href={pathFor(locale, 'setup')}>{labels.setup}<span aria-hidden="true">↗</span></a><a href={pathFor(locale, 'contact')}>{labels.contact}<span aria-hidden="true">↗</span></a><a href={centralUrl('/account', site.source, origin)}>{labels.account}<span aria-hidden="true">↗</span></a></nav></aside>
      </div>
      {page.kind === 'blogs' && <div className="article-grid page-articles">{articles.map((article, index) => <article className="article-card" key={article.slug}><span className="article-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h2><a href={pathFor(locale, article.slug)}>{article.title}</a></h2><p>{article.description}</p><a className="text-link" href={pathFor(locale, article.slug)}>{labels.readMore}<span aria-hidden="true">→</span></a></article>)}</div>}
    </div>
    <SupportSection site={site} locale={locale} labels={labels} text={text} />
  </main>;
}
