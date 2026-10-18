'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCatalog } from './Catalog';
import { message, postResumeLink, savedPlanUrl } from '../lib/api';

export default function CheckoutResume({ site, locale, plan }) {
  const { data } = useCatalog();
  const ui = data?.experience?.ui || {};
  const id = useId();
  const pathname = usePathname();
  const form = useRef(null);
  const operation = useRef(null);
  const resultRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
    setResult(null);
    setStatus('');
    setFailed(false);
    form.current?.reset();
    return () => operation.current?.abort();
  }, [plan.id, locale, pathname]);
  if (!ui.resumeSave) return null;

  async function saveSelection(event) {
    event.preventDefault();
    if (operation.current || !form.current?.reportValidity()) return;
    const fields = new FormData(form.current);
    const email = String(fields.get('email') || '').trim();
    const consent = fields.get('one_send_consent') === 'on';
    if (email && !consent) {
      setStatus(ui.resumeEmailConsent);
      setFailed(true);
      form.current.elements.namedItem('one_send_consent')?.focus();
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setFailed(false);
    setStatus(ui.resumeSaving);
    setResult(null);
    try {
      const payload = { brand: site.brand, package_id: plan.id, locale, website: String(fields.get('website') || '') };
      if (email) { payload.email = email; payload.one_send_consent = true; }
      const response = await postResumeLink(payload, { signal: controller.signal });
      if (operation.current !== controller) return;
      const url = savedPlanUrl(response.data?.url);
      const expires = new Date(response.data?.expires_at);
      if (!url || !Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error('Invalid resume response');
      setResult({ url, expires: expires.toISOString() });
      setStatus(ui.resumeReady);
      form.current?.reset();
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      if (operation.current !== controller) return;
      setFailed(true);
      setStatus(error.status === 429 ? ui.resumeTooMany : [404, 409, 410].includes(error.status)
        ? ui.resumeUnavailable : error.status === 422 ? ui.resumeInvalid : ui.resumeFailed);
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result.url);
      setStatus(ui.resumeCopied);
      setFailed(false);
    } catch { setStatus(ui.resumeCopyFailed); setFailed(true); }
  }

  return <details className="checkout-resume">
    <summary>{ui.resumeSave}</summary>
    <div className="resume-body">
      <h4>{ui.resumeHeading}</h4><p>{ui.resumeIntro}</p>
      <form ref={form} onSubmit={saveSelection} aria-busy={busy}>
        <fieldset disabled={busy}>
          <label htmlFor={id + '-email'}>{ui.resumeEmail}</label>
          <input id={id + '-email'} name="email" type="email" dir="ltr" maxLength={254} autoComplete="email" />
          <label className="consent-check"><input type="checkbox" name="one_send_consent" /><span>{ui.resumeEmailConsent}</span></label>
          <div className="contact-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <button className="button button-secondary" type="submit" disabled={busy}>{busy ? ui.resumeSaving : ui.resumeSave}</button>
        </fieldset>
      </form>
      <p className="field-help">{ui.resumePrivacy}</p>
      <p className="form-status" role="status" aria-live="polite" data-error={failed}>{status}</p>
      {result && <div className="resume-result" ref={resultRef} tabIndex={-1}>
        <p>{message(ui, 'resumeExpires', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.expires)) })}</p>
        <div className="experience-actions"><a className="button button-primary" href={result.url} rel="noreferrer" referrerPolicy="no-referrer">{ui.resumeOpen}</a>
          <button className="button button-secondary" type="button" onClick={copyLink}>{ui.resumeCopy}</button></div>
      </div>}
    </div>
  </details>;
}
