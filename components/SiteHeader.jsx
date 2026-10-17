'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, copy, pathFor } from '../lib/site';
import { centralUrl } from '../lib/api';

export default function SiteHeader({ site, locale, slug = '', labels = {}, nav = {}, text = {} }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountUrl, setAccountUrl] = useState(() => centralUrl('/account', site.source, 'https://opplexiptv.com'));
  const header = useRef(null);
  const menuButton = useRef(null);
  const t = value => copy(value, text);
  const primary = ['', 'packages', 'iptv-applications', 'blogs', 'faqs'];
  const more = ['about', 'contact', 'setup', 'reseller-panel', 'movies', 'shop', 'activate', 'activate-info', 'terms-of-service', 'privacy-policy', 'refund-policy'];
  const title = key => nav[key || 'home'] || labels[key || 'home'] || key;
  const closeMenus = () => {
    setMenuOpen(false);
    header.current?.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open'));
  };

  useEffect(() => {
    closeMenus();
  }, [locale, slug]);

  useEffect(() => {
    setAccountUrl(centralUrl('/account', site.source));
    const onPointer = event => { if (!header.current?.contains(event.target)) closeMenus(); };
    const onKey = event => {
      if (event.key !== 'Escape') return;
      const activeDetails = document.activeElement?.closest('details[open]');
      if (activeDetails) {
        activeDetails.removeAttribute('open');
        activeDetails.querySelector('summary')?.focus();
      } else if (menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return <><a className="skip-link" href="#main">{t('Skip to content')}</a><header className="site-header" ref={header}>
    <div className="container header-inner">
      <Link className="brand" href={pathFor(locale)} aria-label={site.name + ' — ' + (nav.home || labels.home)} onNavigate={closeMenus}>
        {site.brand === 'opplex' ? <img src="https://opplexiptv.com/images/opplexiptvlogo.webp" alt="Opplex IPTV" width="250" height="65" /> : <>
          <span className={'brand-symbol brand-symbol-' + site.brand} aria-hidden="true">{site.brand === 'geo' ? 'G' : site.brand === 'trex' ? 'T' : <><i /><i /></>}</span>
          <span className="brand-name">{site.name}</span>
        </>}
      </Link>
      <button ref={menuButton} type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="site-navigation" aria-label={menuOpen ? nav.close : nav.menu} onClick={() => setMenuOpen(!menuOpen)}>
        <span className={menuOpen ? 'menu-lines is-open' : 'menu-lines'} aria-hidden="true"><i /><i /></span>
        <span>{menuOpen ? nav.close : nav.menu}</span>
      </button>
      <nav className={'main-nav' + (menuOpen ? ' is-open' : '')} id="site-navigation" aria-label={t('Main navigation')}>
        {primary.map(key => <Link key={key} className="nav-link" href={pathFor(locale, key)} aria-current={slug === key || (key === 'blogs' && slug.startsWith('blogs/')) ? 'page' : undefined} onNavigate={closeMenus}>{title(key)}</Link>)}
        <details className="nav-dropdown more-menu">
          <summary className="nav-link">{nav.more}<span className="chevron" aria-hidden="true" /></summary>
          <div className="dropdown-panel more-panel">
            {more.map(key => <Link key={key} href={pathFor(locale, key)} aria-current={slug === key ? 'page' : undefined} onNavigate={closeMenus}>{title(key)}<span aria-hidden="true">↗</span></Link>)}
          </div>
        </details>
      </nav>
      <div className="header-tools">
        <details className="nav-dropdown language-menu">
          <summary aria-label={nav.language || labels.language}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></svg><span className="language-code">{locale.toUpperCase()}</span><span className="chevron" aria-hidden="true" /></summary>
          <div className="dropdown-panel language-panel">
            {SUPPORTED_LOCALES.map(code => <Link key={code} href={pathFor(code, slug)} lang={code} dir={['ar', 'ur'].includes(code) ? 'rtl' : 'ltr'} hrefLang={code} aria-current={code === locale ? 'page' : undefined} onNavigate={closeMenus}>{LANGUAGE_NAMES[code]}{code === locale && <span aria-hidden="true">✓</span>}</Link>)}
          </div>
        </details>
        <a className="account-link" href={accountUrl} aria-label={nav.account || labels.account} title={nav.account || labels.account}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg></a>
      </div>
    </div>
  </header></>;
}
