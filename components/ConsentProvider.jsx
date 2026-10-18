'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiOrigin, centralUrl, message, newRequestId, postLanding } from '../lib/api';
import { copy } from '../lib/site';

const ConsentContext = createContext(null);
const MEASUREMENT_KEY = 'landing-measurement-v1';
const SESSION_KEY = 'landing-session-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let lastTrackedVisit = null;
const BRANDS = ['trex', 'opplex', 'geo', '5g'];
const MEASUREMENT_COPY = 'Allow this website to record page visits and checkout-button clicks, with a random session ID and selected package ID where relevant. No name, email, phone, message or fingerprint is included in these measurement events. If you allow it, that random session ID can also continue through checkout for source measurement. It does not pass contact details or make the person paying the same person as a lead. This is off unless you allow it.';
const PROVIDER_COPY = 'Chat providers and the payment website have their own privacy practices. Your contact form works whether you allow measurement or not.';

export default function ConsentProvider({ site, locale, ui, text, pageSlug = '', experienceUi = {}, children }) {
  const pathname = usePathname();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [origin, setOrigin] = useState('https://opplexiptv.com');
  const allowedRef = useRef(false);
  const sessionRef = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const translated = value => copy(value, text);

  const session = useCallback(() => {
    if (!allowedRef.current || typeof window === 'undefined') return null;
    if (!sessionRef.current) {
      let stored;
      try { stored = window.sessionStorage.getItem(SESSION_KEY); } catch {}
      sessionRef.current = UUID.test(stored || '') ? stored : newRequestId();
      try { window.sessionStorage.setItem(SESSION_KEY, sessionRef.current); } catch {}
    }
    return sessionRef.current;
  }, []);

  const track = useCallback((event, packageId) => {
    if (!allowedRef.current || !BRANDS.includes(site.brand)
      || !['visit', 'checkout_clicked'].includes(event)) return;
    const sessionId = session();
    if (!sessionId) return;
    if (event === 'visit') {
      const key = site.brand + ':' + sessionId + ':' + window.location.pathname;
      if (lastTrackedVisit === key) return;
      lastTrackedVisit = key;
    }
    const data = {
      brand: site.brand,
      event_id: newRequestId(),
      session_id: sessionId,
      event,
      analytics_consent: true,
      locale,
      page: pageSlug,
      website: '',
    };
    if (Number.isSafeInteger(packageId) && packageId > 0) data.package_id = packageId;
    void postLanding('events', data, { keepalive: true }).catch(() => {});
  }, [site.brand, session, locale, pageSlug]);

  useEffect(() => {
    setOrigin(apiOrigin());
    let allowed = false;
    try { allowed = window.localStorage.getItem(MEASUREMENT_KEY) === 'allowed'; } catch {}
    allowedRef.current = allowed;
    setAnalyticsAllowed(allowed);
    const update = event => {
      if (event.key !== MEASUREMENT_KEY && event.key !== null) return;
      const nextAllowed = event.key === MEASUREMENT_KEY && event.newValue === 'allowed';
      allowedRef.current = nextAllowed;
      setAnalyticsAllowed(nextAllowed);
      if (!nextAllowed) {
        sessionRef.current = null;
        try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
      }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  useEffect(() => {
    if (analyticsAllowed) track('visit');
  }, [analyticsAllowed, track, locale, pathname]);

  useEffect(() => {
    openerRef.current = null;
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [pathname]);

  const checkoutLink = useCallback((id, source) => {
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const href = centralUrl('/checkout?package_id=' + id, source, origin);
    if (!href || !analyticsAllowed) return href;
    const sessionId = session();
    if (!sessionId) return href;
    const url = new URL(href);
    url.searchParams.set('landing_consent', '1');
    url.searchParams.set('landing_session', sessionId);
    url.searchParams.set('landing_locale', locale);
    url.searchParams.set('landing_page', pageSlug);
    return url.href;
  }, [origin, analyticsAllowed, session, locale, pageSlug]);

  const openPrivacy = useCallback(() => {
    if (!dialogRef.current || dialogRef.current.open) return;
    openerRef.current = document.activeElement;
    dialogRef.current.showModal();
  }, []);

  function closePrivacy() {
    dialogRef.current?.close();
  }

  function chooseAnalytics(allowed) {
    allowedRef.current = allowed;
    setAnalyticsAllowed(allowed);
    try { window.localStorage.setItem(MEASUREMENT_KEY, allowed ? 'allowed' : 'declined'); } catch {}
    if (!allowed) {
      sessionRef.current = null;
      try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
    } else {
      track('visit');
    }
    closePrivacy();
  }

  const value = useMemo(() => ({
    analyticsAllowed, session, track, checkoutLink, openPrivacy,
  }), [analyticsAllowed, session, track, checkoutLink, openPrivacy]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      <dialog className="landing-dialog privacy-dialog" ref={dialogRef}
        id="privacy-dialog" aria-labelledby="privacy-dialog-title"
        onClose={() => { if (openerRef.current?.isConnected) openerRef.current.focus(); }}>
        <button className="dialog-close" type="button" onClick={closePrivacy}
          aria-label={translated('Close usage measurement settings')}>×</button>
        <p className="eyebrow">{translated('Your choice')}</p>
        <h2 id="privacy-dialog-title">{translated('Optional usage measurement')}</h2>
        <p>{translated(MEASUREMENT_COPY)}</p>
        {experienceUi.measurementDetail && <p>{experienceUi.measurementDetail}</p>}
        <p>{translated(PROVIDER_COPY)}</p>
        <p className="form-status" role="status">
          {message(ui, analyticsAllowed ? 'measurementOn' : 'measurementOff')}
        </p>
        <div className="privacy-actions">
          <button className="button button-primary" type="button" onClick={() => chooseAnalytics(true)}>
            {translated('Allow measurement')}
          </button>
          <button className="button button-secondary" type="button" onClick={() => chooseAnalytics(false)}>
            {translated('Keep measurement off')}
          </button>
        </div>
      </dialog>
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) throw new Error('useConsent must be used inside ConsentProvider');
  return context;
}

export function PrivacySettings({ children, className = 'privacy-settings-link' }) {
  const { openPrivacy } = useConsent();
  return <button className={className} type="button" onClick={openPrivacy}>{children}</button>;
}
