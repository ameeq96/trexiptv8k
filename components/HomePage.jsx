'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Catalog, { useCatalog } from './Catalog';
import { useSupport } from './SupportWidget';
import { copy, pathFor } from '../lib/site';
import { centralUrl, message } from '../lib/api';

const brandCopy = {
  trex: { eyebrow: 'An invitation to switch off', plans: 'The main event', deviceTitle: ['Big screen.', 'Small screen.', 'Your screen.'], deviceIntro: 'Check the device options listed by Opplex IPTV. For setup questions, the support team can help you find the next step.', guide: 'Before you choose', faq: 'Good to know', support: "Let's find your next chapter", catalogue: 'Connected to the Opplex IPTV catalogue', note: ['Current plans from Opplex IPTV. Secure checkout through Opplexify.'] },
  opplex: { eyebrow: 'The everyday escape', plans: '01 / Find your fit', deviceTitle: ['Find your', 'IPTV device', 'setup.'], deviceIntro: "Using a Smart TV, Fire TV Stick or Android device? Tell support the exact model and player app before buying. A familiar device name alone doesn't confirm that every app or connection option will work.", guide: 'Before your first order', faq: 'A little clarity', support: "Let's make it simple", catalogue: 'Your plan. Your screen. One simple start.', note: ['Plan catalogue and support are fulfilled through Opplex IPTV. Secure checkout opens on Opplexify via the central website.'] },
  geo: { eyebrow: 'A fresh perspective', plans: 'The plan collection', deviceTitle: ['Your screen.', 'Your starting point.'], deviceIntro: 'Every setup begins somewhere. Check the device options listed by Opplex IPTV, then ask the support team about your particular screen and player.', guide: 'The comparison notebook', faq: 'The useful answers', support: 'The next conversation', catalogue: 'Your next setup starts here.', note: ['Current plans from Opplex IPTV.', 'Secure checkout through Opplexify.'] },
  '5g': { eyebrow: 'ENTER YOUR NEXT CHAPTER', plans: '01 / Find your fit', deviceTitle: ['Your screen.', 'Our starting point.'], deviceIntro: 'Check the device options listed by Opplex IPTV. For setup questions, the support team can help you find the next step.', guide: 'Connection check', faq: 'Your quick reference', support: '03 / Human guidance', catalogue: 'One catalogue. Everything in focus.', note: ['Plan catalogue and support are fulfilled through Opplex IPTV. Secure checkout opens on Opplexify via the central website.'] },
};

function ScreenArtwork({ brand }) {
  if (brand === 'trex') return <div className="cinema-stage" aria-hidden="true"><span className="cinema-word">TREX</span><div className="cinema-arches"><i /><i /><i /><i /><i /></div><span className="cinema-floor" /><span className="cinema-corner">↗</span></div>;
  if (brand === 'geo') return <div className="geo-art" aria-hidden="true"><div className="geo-orbit orbit-one" /><div className="geo-orbit orbit-two" /><div className="geo-globe"><i /><i /><i /></div><span className="geo-sun" /><span className="geo-horizon" /><span className="geo-coordinate">GEO</span></div>;
  if (brand === '5g') return <div className="network-art" aria-hidden="true"><span className="network-path path-one" /><span className="network-path path-two" /><span className="network-node node-one" /><span className="network-node node-two" /><span className="network-node node-three" /><div className="screen-tv"><div className="screen-content"><span>5G</span><i /><i /><i /></div></div><div className="screen-phone"><i /><i /><i /></div><span className="network-word">LIVE</span></div>;
  return <div className="store-art" aria-hidden="true"><span className="store-circle circle-one" /><span className="store-circle circle-two" /><div className="screen-tv"><div className="screen-content"><span className="screen-play">▶</span><i /><i /><i /></div></div><div className="screen-phone"><i /><i /><i /></div><div className="screen-remote"><i /><i /><i /></div><span className="screen-plinth" /></div>;
}

export function SupportSection({ site, locale, text = {}, labels = {} }) {
  const { openContact } = useSupport();
  const [origin, setOrigin] = useState('https://opplexiptv.com');
  useEffect(() => { setOrigin(new URL(centralUrl('/contact', site.source)).origin); }, [site.source]);
  const { data } = useCatalog();
  const t = value => copy(value, text);
  const heading = site.brand === 'trex' ? ['Questions?', "We're listening."] : site.brand === 'geo' ? ['Let’s find your', 'next connection.'] : site.brand === '5g' ? ['One question away', 'from your next step.'] : ['Need a hand choosing?'];
  return <section id="support" className="support-section container" aria-labelledby="support-heading"><div className="support-card">
    <div><p className="eyebrow">{t(brandCopy[site.brand].support)}</p><h2 id="support-heading">{heading.map(t).join(' ')}</h2><p>{t('Talk to Opplex IPTV about plans, devices or getting started.')}</p></div>
    <div className="support-actions"><button type="button" className="button button-primary" onClick={event => openContact('whatsapp', event.currentTarget)}>{labels.contact || t('Contact support')}<span aria-hidden="true">↗</span></button>
      {data?.support?.email && <a className="support-detail" href={'mailto:' + data.support.email}>{data.support.email}</a>}
      {data?.support?.phone && <a className="support-detail" href={'tel:+' + data.support.phone.replace(/\D/g, '')}>{data.support.phone_display || data.support.phone}</a>}
      <a className="support-main-link" href={centralUrl('/contact', site.source, origin)}>{t("Or use the main website's contact page")}</a>
    </div>
  </div></section>;
}

export default function HomePage({ site, locale, ui = {}, text = {}, labels = {}, nav = {}, pages = [] }) {
  const { data, loading, devices, deviceError } = useCatalog();
  const t = value => copy(value, text);
  const theme = brandCopy[site.brand];
  const content = data?.content || {};
  const highlights = content.highlights || [];
  const guides = content.guide_sections || [];
  const faqs = content.faqs || [];
  const articles = pages.filter(page => page.kind === 'article');
  const firstPlan = data?.packages?.[0];

  return <main id="main" className={'home-page home-' + site.theme}>
    <section className="hero" aria-labelledby="hero-heading">
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true" />{t(theme.eyebrow)}</p>
          <h1 id="hero-heading">{content.hero_heading || site.name}</h1>
          <p className="hero-description">{content.hero_description}</p>
          <div className="hero-actions"><a href="#plans" className="button button-primary">{nav.packages || labels.packages}<span aria-hidden="true">↗</span></a><Link href={pathFor(locale, 'setup')} className="text-link">{nav.setup || labels.setup}<span aria-hidden="true">→</span></Link></div>
          <p className="hero-note">{theme.note.map(t).join(' ')}</p>
        </div>
        <div className="hero-visual"><ScreenArtwork brand={site.brand} />
          <a className="hero-plan-preview" href="#plans"><span className="hero-preview-copy"><small>{t('From the current catalogue')}</small><strong>{data?.provider_name || site.name}</strong></span><span className="hero-preview-price">{firstPlan?.price || (loading ? '…' : '—')}</span><span className="preview-arrow" aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>

    <div className="source-strip"><div className="container source-strip-inner"><p><span className="source-dot" aria-hidden="true" />{t(theme.catalogue)}</p><Link href={pathFor(locale, 'about')}>{nav.about}<span aria-hidden="true">↗</span></Link></div></div>

    <section className="section plans-section" id="plans" aria-labelledby="plans-heading"><div className="container plans-layout">
      <div className="section-heading plans-heading"><div><p className="eyebrow">{t(theme.plans)}</p><h2 id="plans-heading">{nav.packages || labels.packages}</h2></div><p>{t('Prices and availability come from Opplex IPTV. Review your final order details before paying.')}</p></div>
      <Catalog site={site} locale={locale} ui={ui} labels={{ retry: labels.retry }} />
    </div></section>

    {highlights.length > 0 && <section className="highlights-section container" aria-label={nav.packages || labels.packages}><div className="highlights-grid">{highlights.map((item, index) => <div className="highlight-item" key={item}><span className="highlight-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{item}</p><span aria-hidden="true">↗</span></div>)}</div></section>}

    <section className="section devices-section" id="devices" aria-labelledby="devices-heading"><div className="container device-layout">
      <div className="devices-intro"><p className="eyebrow">{nav['iptv-applications']}</p><h2 id="devices-heading">{theme.deviceTitle.map(t).join(' ')}</h2><p>{t(theme.deviceIntro)}</p><Link className="text-link" href={pathFor(locale, 'iptv-applications')}>{nav['iptv-applications']}<span aria-hidden="true">↗</span></Link></div>
      <div className="devices-panel"><div className="device-drawing" aria-hidden="true"><span className="draw-monitor" /><span className="draw-tablet" /><span className="draw-phone" /></div><div className="device-list">{(devices || []).map(device => <div className="device-item" key={device.id || device.name}><span className="device-dot" aria-hidden="true" /><span>{device.name}</span></div>)}</div>
        {deviceError && <p className="field-help" role="status">{message(ui, deviceError)}</p>}
        {!deviceError && !(devices || []).length && <p role="status">{t('Loading device information…')}</p>}
        <p className="device-note">{t(site.brand === 'geo' ? 'Illustrative screens. Availability and setup requirements may vary by device and selected service.' : 'Availability and setup requirements may vary by device and selected service.')}</p>
      </div>
    </div></section>

    {(content.guide_heading || guides.length > 0) && <section className="section guide-section" id="guide" aria-labelledby="guide-heading"><div className="container"><div className="section-heading"><div><p className="eyebrow">{t(theme.guide)}</p><h2 id="guide-heading">{content.guide_heading}</h2></div><p>{content.guide_intro}</p></div><div className="guide-grid">{guides.map((item, index) => <article className="guide-card" key={item.heading}><span className="guide-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h3>{item.heading}</h3><p>{item.body}</p></article>)}</div></div></section>}

    {faqs.length > 0 && <section className="section faq-section" id="faq" aria-labelledby="faq-heading"><div className="container faq-layout"><div className="faq-intro"><p className="eyebrow">{t(theme.faq)}</p><h2 id="faq-heading">{nav.faqs}</h2><p>{t(site.brand === 'geo' ? 'Good questions deserve a clear starting point. Here’s useful information from Opplex IPTV, all in one place.' : 'Useful information from Opplex IPTV, brought together before you choose.')}</p><Link className="text-link" href={pathFor(locale, 'faqs')}>{nav.faqs}<span aria-hidden="true">↗</span></Link></div><div className="faq-list">{faqs.map(item => <details className="faq-item" key={item.question}><summary>{item.question}<span className="faq-plus" aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></div></section>}

    {articles.length > 0 && <section className="section articles-section container" aria-labelledby="articles-heading"><div className="section-heading"><h2 id="articles-heading">{nav.blogs}</h2><Link className="text-link" href={pathFor(locale, 'blogs')}>{labels.readMore}<span aria-hidden="true">↗</span></Link></div><div className="article-grid">{articles.map((article, index) => <article className="article-card" key={article.slug}><span className="article-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h3><Link href={pathFor(locale, article.slug)}>{article.title}</Link></h3><p>{article.description}</p><Link className="text-link" href={pathFor(locale, article.slug)}>{labels.readMore}<span aria-hidden="true">→</span></Link></article>)}</div></section>}
    <SupportSection site={site} locale={locale} labels={labels} text={text} />
  </main>;
}
