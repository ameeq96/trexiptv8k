'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { availablePlans, durationText, getApiData, message, money } from '../lib/api';
import { useConsent } from './ConsentProvider';
import CheckoutResume from './CheckoutResume';

const CatalogContext = createContext(null);
const PROVIDERS = {
  trex: 'TREX IPTV',
  opplex: 'Opplex iptv',
  geo: 'GEO World IPTV',
  '5g': '5G IPTV',
};

function validateCatalog(data, brand, locale) {
  if (!Object.hasOwn(PROVIDERS, brand) || !data || data.brand !== brand
    || data.locale !== locale || data.provider_name !== PROVIDERS[brand]
    || !Array.isArray(data.packages)) return null;
  const packages = availablePlans(data.packages, locale)
    .filter(plan => plan.service === data.provider_name);
  return { ...data, packages };
}

function validDevices(rows) {
  return Array.isArray(rows)
    ? rows.filter(device => typeof device?.name === 'string' && device.name.trim())
    : [];
}

export function CatalogProvider({ site, locale, initialData, initialDevices = [], withDevices = false, children }) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState(() => validateCatalog(initialData, site.brand, locale));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deviceSnapshot, setDeviceSnapshot] = useState(() => ({ locale, enabled: withDevices, rows: validDevices(initialDevices) }));
  const [deviceError, setDeviceError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestKey = useMemo(() => ({}), [site.brand, locale, withDevices, revision, initialData, pathname]);
  const [verifiedRequest, setVerifiedRequest] = useState(null);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setSnapshot(current => validateCatalog(current, site.brand, locale)
      || validateCatalog(initialData, site.brand, locale));
    setVerifiedRequest(null);
    setLoading(true);
    setError('');
    setDeviceError('');
    if (withDevices) setDeviceSnapshot(current => current.locale === locale && current.enabled
      ? current : { locale, enabled: true, rows: validDevices(initialDevices) });

    if (!Object.hasOwn(PROVIDERS, site.brand)) {
      setLoading(false);
      setError('missingBrand');
      return () => { active = false; controller.abort(); };
    }

    getApiData('brands/' + site.brand + '/content?locale=' + encodeURIComponent(locale), controller.signal)
      .then(response => {
        if (!active) return;
        const data = validateCatalog(response, site.brand, locale);
        if (!data) throw new Error('Invalid brand catalog');
        setSnapshot(data);
        setVerifiedRequest(data.packages.length ? requestKey : null);
        setError(data.packages.length ? '' : 'noPlans');
      })
      .catch(() => {
        if (!active) return;
        setError('pricesError');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    if (withDevices) {
      getApiData('configure?locale=' + encodeURIComponent(locale), controller.signal)
        .then(response => {
          if (!active) return;
          if (!Array.isArray(response.devices)) throw new Error('Invalid device response');
          setDeviceSnapshot({ locale, enabled: true, rows: validDevices(response.devices) });
        })
        .catch(() => {
          if (!active) return;
          setDeviceError('deviceError');
        });
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [site.brand, locale, withDevices, revision, initialData, pathname, requestKey]);

  const data = useMemo(() => validateCatalog(snapshot, site.brand, locale)
    || validateCatalog(initialData, site.brand, locale), [snapshot, initialData, site.brand, locale]);
  const devices = deviceSnapshot.locale === locale && deviceSnapshot.enabled === withDevices
    ? deviceSnapshot.rows : validDevices(initialDevices);
  const checkoutReady = verifiedRequest === requestKey && !loading && !error && !!data?.packages.length;
  const value = useMemo(() => ({
    data, loading, error, reload, devices, deviceError, checkoutReady,
  }), [data, loading, error, reload, devices, deviceError, checkoutReady]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}

export default function Catalog({ site, locale, ui, labels = {} }) {
  const { data, loading, error, reload, checkoutReady } = useCatalog();
  const { checkoutLink, track } = useConsent();
  const plans = data?.packages || [];
  const provider = data?.provider_name || '';
  const t = (key, values) => message(ui, key, values);
  const count = value => new Intl.NumberFormat(locale).format(value);

  return (
    <section className="catalog-section" id="packages" aria-label={labels.heading || t('loadingPlans')}>
      {(labels.heading || labels.intro) && (
        <div className="catalog-heading">
          {labels.heading && <h2>{labels.heading}</h2>}
          {labels.intro && <p>{labels.intro}</p>}
        </div>
      )}
      {provider && <p className="provider-label">{provider}</p>}
      <div className="catalog-feedback">
        <p id="catalog-status" className="catalog-status" role="status">
          {loading ? t('loadingBrand') : error ? t(error) : t('plansAvailable', { provider, count: count(plans.length) })}
        </p>
        {error && !loading && error !== 'missingBrand' && (
          <button className="button button-secondary" type="button" onClick={reload}>
            {labels.retry || ui.retry || t('loadingPlans')} <span aria-hidden="true">↻</span>
          </button>
        )}
      </div>
      <div className="plan-grid" id="plan-grid" aria-busy={loading}>
        {plans.map(plan => {
          const duration = durationText(plan.duration_months, locale);
          const href = checkoutLink(plan.id, site.source);
          return (
            <article className="plan-card" key={plan.id}>
              <p className="plan-provider">{provider}</p>
              <h3 className="plan-duration">{duration}</h3>
              <p className="plan-price">{plan.price}</p>
              <p className="plan-description">{t('fullPlan', { duration })}</p>
              <ul className="plan-features">
                <li>{t('finalFees')}</li>
                <li>{Number.isSafeInteger(plan.max_devices) && plan.max_devices > 0
                  ? t('connectionCount', { count: count(plan.max_devices) })
                  : t('confirmConnections')}</li>
              </ul>
              {href && (checkoutReady ? (
                <a className="button button-primary plan-cta" href={href}
                  aria-label={t('checkoutLabel', { provider, duration, price: plan.price })}
                  onClick={() => track('checkout_clicked', plan.id)}>
                  {t('checkout')} <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <button className="button button-primary plan-cta" type="button" disabled
                  aria-describedby="catalog-status" aria-label={t('checkoutLabel', { provider, duration, price: plan.price })}>
                  {t('checkout')} <span aria-hidden="true">↗</span>
                </button>
              ))}
              <CheckoutResume site={site} locale={locale} plan={plan} />
            </article>
          );
        })}
      </div>
      {plans.length > 0 && (
        <section className="plan-comparison" id="plan-comparison" aria-labelledby="plan-comparison-heading">
          <h3 id="plan-comparison-heading">{t('compare')}</h3>
          <p>{t('equivalentNote')}</p>
          <div className="comparison-scroll" tabIndex={0} role="region" aria-label={t('comparisonRegion')}>
            <table>
              <caption>{t('comparisonCaption', { provider })}</caption>
              <thead><tr>{['term', 'total', 'equivalent', 'connections'].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead>
              <tbody>
                {plans.map(plan => (
                  <tr key={plan.id}>
                    <th scope="row">{durationText(plan.duration_months, locale)}</th>
                    <td>{plan.price}</td>
                    <td>{money(Number(plan.price_amount) / plan.duration_months, plan.currency, locale)}</td>
                    <td>{Number.isSafeInteger(plan.max_devices) && plan.max_devices > 0 ? count(plan.max_devices) : t('confirmSupport')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="catalog-note">{t(error === 'pricesError' ? 'pricesError' : 'priceNote')}</p>
        </section>
      )}
    </section>
  );
}
