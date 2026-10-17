'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { copy, pathFor } from '../lib/site';
import { centralUrl } from '../lib/api';
import { useConsent } from './ConsentProvider';

export default function SiteFooter({ site, locale, text = {}, labels = {}, nav = {} }) {
  const { openPrivacy } = useConsent();
  const [origin, setOrigin] = useState('https://opplexiptv.com');
  useEffect(() => { setOrigin(new URL(centralUrl('/account', site.source)).origin); }, [site.source]);
  const t = value => copy(value, text);
  const help = [
    ['/account', 'My account'],
    ['/account/setup', 'Device setup guides'],
    ['/account/support', 'Order support'],
  ];
  const checklist = [
    'Note your exact device model and operating system.',
    'Check the player app and any separate app licence fee.',
    "Confirm the selected plan's simultaneous connection allowance.",
    'Ask support to confirm your intended setup and location. A device name alone is not a compatibility guarantee.',
  ];

  return <footer className="site-footer">
    <div className="container">
      <section className="customer-tools" aria-labelledby="customer-tools-heading">
        <div><p className="eyebrow">{t('Your next steps')}</p><h2 id="customer-tools-heading">{t('Help before and after you choose.')}</h2><p>{t('Your account and support stay with the main Opplex IPTV website. Sign-in may be required.')}</p></div>
        <div className="customer-tools-right">
          <nav className="customer-tools-links" aria-label={t('Customer account and help')}>
            {help.map(([path, name]) => <a key={path} href={centralUrl(path, site.source, origin)}>{t(name)}<span aria-hidden="true">↗</span></a>)}
          </nav>
          <details className="device-checklist"><summary>{t('Before you buy: a quick device checklist')}</summary><ul>{checklist.map(item => <li key={item}>{t(item)}</li>)}</ul></details>
        </div>
      </section>
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="brand" href={pathFor(locale)}>{site.brand === 'opplex' ? <img src="https://opplexiptv.com/images/opplexiptvlogo.webp" alt="Opplex IPTV" width="250" height="65" /> : <span className="brand-name">{site.name}</span>}</Link>
          <p>{t('Plan catalogue and support are fulfilled through Opplex IPTV. Secure checkout opens on Opplexify via the central website.')}</p>
        </div>
        <nav className="footer-links" aria-label={nav.more}><Link href={pathFor(locale, 'about')}>{nav.about}</Link><Link href={pathFor(locale, 'packages')}>{nav.packages || labels.packages}</Link><Link href={pathFor(locale, 'blogs')}>{nav.blogs}</Link><Link href={pathFor(locale, 'contact')}>{nav.contact || labels.contact}</Link></nav>
        <nav className="footer-links legal-links" aria-label={t('Legal')}><Link href={pathFor(locale, 'terms-of-service')}>{t('Terms')}</Link><Link href={pathFor(locale, 'privacy-policy')}>{t('Privacy')}</Link><Link href={pathFor(locale, 'refund-policy')}>{t('Refund policy')}</Link><button className="privacy-settings-link" type="button" onClick={openPrivacy}>{t('Optional usage measurement settings')}</button></nav>
      </div>
      <div className="footer-bottom"><p>© {new Date().getFullYear()} {site.name}</p><a href="#main">{t('Back to top')} <span aria-hidden="true">↑</span></a></div>
    </div>
  </footer>;
}
