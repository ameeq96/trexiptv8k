import Link from 'next/link';
import { pathFor } from '../lib/site';

export default function BlogListing({ items = [], locale, labels = {}, page = 1, pageCount = 1, mode = 'index', title, nav = {} }) {
  if (!items.length) return null;
  const standalone = mode === 'archive';
  const latest = mode === 'latest';
  const heading = latest ? labels.latestArticles : labels.blogArchive;
  const slugFor = number => number === 1 ? 'blogs' : 'blogs/page/' + number;
  const cards = <div className="article-grid">{items.map((item, index) => <article className="article-card" key={item.id} data-blog-card-id={item.id}>
    <span className="article-number" aria-hidden="true">{String((page - 1) * 12 + index + 1).padStart(2, '0')}</span>
    {standalone ? <h2><Link href={pathFor(locale, 'blogs/' + item.slug)}>{item.title}</Link></h2>
      : <h3><Link href={pathFor(locale, 'blogs/' + item.slug)}>{item.title}</Link></h3>}
    <p>{item.excerpt}</p><p className="field-help"><time dateTime={item.published_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(item.published_at))}</time></p>
    <Link className="text-link" href={pathFor(locale, 'blogs/' + item.slug)}>{labels.readArticle}<span aria-hidden="true">→</span></Link>
  </article>)}</div>;
  const pagination = !latest && pageCount > 1 && <nav className="experience-actions" aria-label={labels.blogArchive}>
    {page > 1 && <Link className="text-link" rel="prev" href={pathFor(locale, slugFor(page - 1))}><span aria-hidden="true">←</span>{labels.previousPage}</Link>}
    <span aria-current="page">{labels.pageLabel.replace('{page}', String(page))}</span>
    {page < pageCount && <Link className="text-link" rel="next" href={pathFor(locale, slugFor(page + 1))}>{labels.nextPage}<span aria-hidden="true">→</span></Link>}
  </nav>;
  if (standalone) return <main id="main" className="content-page page-blogs"><div className="container">
    <nav className="breadcrumb" aria-label={labels.blogArchive}><Link href={pathFor(locale)}>{nav.home}</Link><span aria-hidden="true">/</span><Link href={pathFor(locale, 'blogs')}>{nav.blogs}</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>
    <header className="page-heading"><p className="eyebrow">{labels.blogArchive}</p><h1>{title}</h1></header>{cards}{pagination}
  </div></main>;
  return <section className={latest ? 'section articles-section container' : 'section page-articles'} aria-labelledby={latest ? 'cms-latest-heading' : 'cms-blog-archive-heading'}>
    <div className="section-heading"><h2 id={latest ? 'cms-latest-heading' : 'cms-blog-archive-heading'}>{heading}</h2>
      {latest && <Link className="text-link" href={pathFor(locale, 'blogs')}>{labels.blogArchive}<span aria-hidden="true">↗</span></Link>}</div>
    {cards}{pagination}
  </section>;
}
