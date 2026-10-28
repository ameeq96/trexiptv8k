import Link from 'next/link';
import { pathFor } from '../lib/site';

export default function BlogArticle({ site, locale, post, labels = {}, nav = {}, relatedPages = [] }) {
  const article = post.translations[locale];
  const ownOrigin = 'https://' + site.domain;
  const reference = link => {
    const url = new URL(link.url);
    return url.origin === ownOrigin
      ? <Link className="text-link" href={url.pathname + url.search + url.hash}>{link.label}</Link>
      : <a className="text-link" href={link.url} rel="noopener noreferrer">{link.label}<span aria-hidden="true">↗</span></a>;
  };
  return <main id="main" className="content-page page-article" data-blog-id={post.id} data-blog-revision={post.revision}>
    <div className="container">
      <nav className="breadcrumb" aria-label={labels.blogArchive}><Link href={pathFor(locale)}>{nav.home}</Link><span aria-hidden="true">/</span><Link href={pathFor(locale, 'blogs')}>{nav.blogs}</Link><span aria-hidden="true">/</span><span aria-current="page">{article.title}</span></nav>
      <header className="page-heading"><p className="eyebrow">{labels.blogArchive}</p><h1>{article.title}</h1>
        <p className="field-help">{post.author.name} · {labels.publishedOn} <time dateTime={post.published_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(post.published_at))}</time></p>
        <p className="page-intro">{article.excerpt}</p>
      </header>
      <div className="content-layout"><article className="page-copy">
        {article.sections.map((section, index) => <section className="copy-section" key={index} aria-labelledby={'blog-section-' + index}>
          <span className="section-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h2 id={'blog-section-' + index}>{section.heading}</h2>
            {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
            {section.items.length > 0 && <ul>{section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}
            {section.links.length > 0 && <ul>{section.links.map((link, linkIndex) => <li key={linkIndex}>{reference(link)}</li>)}</ul>}
          </div>
        </section>)}
        {relatedPages.length > 0 && <nav className="copy-section" aria-labelledby="blog-related-heading"><span className="section-index" aria-hidden="true">↗</span><div><h2 id="blog-related-heading">{nav.blogs}</h2><ul>{relatedPages.map(page => <li key={page.slug}><Link className="text-link" href={pathFor(locale, page.slug)}>{page.title}</Link></li>)}</ul></div></nav>}
        <Link className="text-link" href={pathFor(locale, 'blogs')}><span aria-hidden="true">←</span>{labels.blogArchive}</Link>
      </article><aside className="page-sidebar"><p className="eyebrow">{nav.setup}</p><nav aria-label={labels.blogArchive}>
        <Link href={pathFor(locale, 'packages')}>{nav.packages}<span aria-hidden="true">↗</span></Link>
        <Link href={pathFor(locale, 'setup')}>{nav.setup}<span aria-hidden="true">↗</span></Link>
        <Link href={pathFor(locale, 'contact')}>{nav.contact}<span aria-hidden="true">↗</span></Link>
      </nav></aside></div>
    </div>
  </main>;
}
