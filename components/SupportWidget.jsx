'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useConsent } from './ConsentProvider.jsx';
import { useCatalog } from './Catalog.jsx';
import { centralUrl, message, newRequestId, postLanding } from '../lib/api.js';
import { copy, pathFor } from '../lib/site.js';

const SupportContext = createContext(null);
const CHAT_EMBED = 'https://embed.tawk.to/6ac929cd7f1f3634beb0e4f6/1k4gsmj54';
const WHATSAPP_MESSAGE = 'Hi, I saw your featured IPTV content and I am interested. Please share subscription details and how to start.';

export function SupportProvider({ children }) {
  const [request, setRequest] = useState(null);
  const openContact = useCallback((channel, trigger) => {
    if (channel !== 'whatsapp' && channel !== 'tawk') return;
    setRequest({ channel, trigger });
  }, []);
  const value = useMemo(() => ({ openContact, request }), [openContact, request]);
  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export function useSupport() {
  const context = useContext(SupportContext);
  if (!context) throw new Error('Support controls must be inside SupportProvider.');
  return context;
}

export default function SupportWidget({ site, locale, ui, text }) {
  const { openContact, request } = useSupport();
  const { analyticsAllowed, session } = useConsent();
  const { data } = useCatalog();
  const dialog = useRef(null);
  const form = useRef(null);
  const opener = useRef(null);
  const chatLauncher = useRef(null);
  const requestId = useRef(null);
  const operation = useRef(null);
  const pending = useRef(false);
  const savedChat = useRef(() => {});
  const [channel, setChannel] = useState('whatsapp');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [hasError, setHasError] = useState(false);
  const [chatStatus, setChatStatus] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [contactHref, setContactHref] = useState(() => centralUrl('/contact', site.source, 'https://opplexiptv.com'));
  const t = value => copy(value, text);
  const digits = typeof data?.support?.phone === 'string' ? data.support.phone.replace(/\D/g, '') : '';
  const phone = /^\d{7,15}$/.test(digits) ? digits : '923054136663';
  const whatsappHref = `https://wa.me/${phone}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  useEffect(() => {
    setContactHref(centralUrl('/contact', site.source));
  }, [site.source]);

  useEffect(() => {
    if (!request || !dialog.current) return;
    if (pending.current) {
      if (!dialog.current.open) dialog.current.showModal();
      return;
    }
    requestId.current = newRequestId();
    opener.current = request.trigger;
    form.current?.reset();
    setChannel(request.channel);
    setStatus('');
    setHasError(false);
    if (!dialog.current.open) dialog.current.showModal();
    form.current?.elements.namedItem('name')?.focus();
  }, [request]);

  useEffect(() => () => {
    operation.current?.abort();
    operation.current = null;
    pending.current = false;
  }, []);

  useEffect(() => {
    const api = window.Tawk_API = window.Tawk_API || {};
    let active = true;
    let ready = typeof api.maximize === 'function' && typeof api.showWidget === 'function';
    let loading = false;
    let requested = false;
    let timer;
    let script;
    const previous = {};
    window.Tawk_LoadStart = new Date();
    api.customStyle = {
      visibility: {
        desktop: { position: 'br', xOffset: 20, yOffset: 20 },
        mobile: { position: 'br', xOffset: 10, yOffset: 10 },
      },
    };
    const closeChat = () => {
      requested = false;
      api.hideWidget?.();
      if (active) {
        setChatExpanded(false);
        setChatBusy(false);
      }
    };
    const showChat = () => {
      api.showWidget?.();
      api.maximize?.();
    };
    const handlers = {
      onBeforeLoad: () => { if (!requested) api.hideWidget?.(); },
      onLoad: () => {
        if (!active) return;
        ready = true;
        loading = false;
        clearTimeout(timer);
        setChatBusy(false);
        setChatStatus('');
        if (requested) showChat();
        else closeChat();
      },
      onChatMaximized: () => {
        if (!active) return;
        if (!requested) {
          api.minimize?.();
          closeChat();
          return;
        }
        setChatExpanded(true);
        setChatStatus('');
      },
      onChatMinimized: () => {
        if (!active) return;
        closeChat();
        requestAnimationFrame(() => { if (active) chatLauncher.current?.focus(); });
      },
    };
    for (const [key, handler] of Object.entries(handlers)) {
      previous[key] = api[key];
      api[key] = handler;
    }
    const loadWidget = () => {
      if (!active || loading || ready) return;
      loading = true;
      script = document.getElementById('landing-tawk-embed');
      if (!script) {
        script = document.createElement('script');
        script.id = 'landing-tawk-embed';
        script.async = true;
        script.src = CHAT_EMBED;
        script.charset = 'UTF-8';
        script.setAttribute('crossorigin', '*');
        script.onerror = () => {
          if (!active || ready) return;
          loading = false;
          clearTimeout(timer);
          setChatBusy(false);
          setChatExpanded(false);
          setChatStatus(message(ui, 'chatFailed'));
          script.remove();
        };
        document.head.appendChild(script);
      }
      timer = setTimeout(() => {
        if (!active || ready) return;
        setChatBusy(false);
        setChatStatus(message(ui, 'chatSlow'));
      }, 15000);
    };
    savedChat.current = () => {
      if (!active) return;
      requested = true;
      if (ready) {
        showChat();
      } else if (loading) {
        setChatStatus(message(ui, 'chatLoading'));
      } else {
        setChatBusy(true);
        setChatStatus(message(ui, 'chatOpening'));
        loadWidget();
      }
    };
    closeChat();
    if (!window.matchMedia('(max-width: 768px)').matches) loadWidget();
    return () => {
      active = false;
      requested = false;
      clearTimeout(timer);
      savedChat.current = () => {};
      api.hideWidget?.();
      if (script && !ready) {
        script.onerror = null;
        script.remove();
      }
      for (const [key, handler] of Object.entries(handlers)) {
        if (api[key] === handler) api[key] = previous[key];
      }
    };
  }, [ui]);

  function cancelContact() {
    requestId.current = null;
    operation.current?.abort();
    operation.current = null;
    pending.current = false;
    setBusy(false);
    dialog.current?.close();
  }

  function closedContact() {
    cancelContact();
    form.current?.reset();
    opener.current?.focus();
  }

  function clearValidity(event) {
    event.target.setCustomValidity?.('');
  }

  function invalidField(event) {
    const field = event.target;
    if (typeof field.setCustomValidity !== 'function') return;
    const key = field.validity.valueMissing
      ? (field.type === 'checkbox' ? 'consentRequired' : 'required')
      : field.type === 'email' && field.validity.typeMismatch ? 'emailInvalid' : 'fieldInvalid';
    field.setCustomValidity(message(ui, key));
  }

  async function submitContact(event) {
    event.preventDefault();
    const currentForm = form.current;
    if (pending.current || !requestId.current || !currentForm.reportValidity()) return;
    const fields = new FormData(currentForm);
    const contactPhone = String(fields.get('phone') || '').trim();
    if (!/^[+\d\s()-]+$/.test(contactPhone) || !/^\d{8,15}$/.test(contactPhone.replace(/\D/g, ''))) {
      setStatus(message(ui, 'phoneInvalid'));
      setHasError(true);
      currentForm.elements.namedItem('phone')?.focus();
      return;
    }
    const controller = new AbortController();
    const eventId = requestId.current;
    operation.current = controller;
    pending.current = true;
    setBusy(true);
    setStatus(message(ui, 'saving'));
    setHasError(false);
    const payload = {
      brand: site.brand, event_id: eventId,
      name: String(fields.get('name') || '').trim(),
      email: String(fields.get('email') || '').trim(), phone: contactPhone,
      message: String(fields.get('message') || '').trim(), channel,
      contact_consent: fields.get('contact_consent') === 'on',
      analytics_consent: analyticsAllowed, website: String(fields.get('website') || ''),
    };
    if (analyticsAllowed) payload.session_id = session();
    try {
      const result = await postLanding('leads', payload, { signal: controller.signal });
      if (result?.ok !== true) throw new Error('unconfirmed');
      if (operation.current !== controller || requestId.current !== eventId || !dialog.current?.open) return;
      setStatus(message(ui, 'saved'));
      currentForm.reset();
      operation.current = null;
      requestId.current = null;
      pending.current = false;
      setBusy(false);
      dialog.current.close();
      if (channel === 'whatsapp') window.location.assign(whatsappHref);
      else savedChat.current();
    } catch (error) {
      if (operation.current !== controller || requestId.current !== eventId) return;
      const field = ['name', 'email', 'phone', 'message', 'contact_consent'].find(key => error.fields?.[key]);
      const key = error.name === 'AbortError' ? 'saveTimeout'
        : error.status === 429 ? 'tooMany' : error.status === 409 ? 'conflict'
          : error.message === 'unconfirmed' ? 'unconfirmed' : 'saveFailed';
      setStatus(field ? message(ui, 'invalidField', { field: message(ui, `field_${field}`) }) : message(ui, key));
      setHasError(true);
      if (field) requestAnimationFrame(() => {
        if (requestId.current === eventId && dialog.current?.open) currentForm.elements.namedItem(field)?.focus();
      });
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return <>
    <dialog ref={dialog} className="landing-dialog" id="contact-dialog" aria-labelledby="contact-dialog-title" aria-describedby="contact-dialog-description" onCancel={event => { event.preventDefault(); cancelContact(); }} onClose={closedContact}>
      <button className="dialog-close" id="contact-dialog-close" type="button" aria-label={t('Close contact form')} onClick={cancelContact}>×</button>
      <p className="eyebrow">{t("Let's get you to the right team")}</p>
      <h2 id="contact-dialog-title">{t('How can we help?')}</h2>
      <p id="contact-dialog-description">{t('Your details and message will be saved with Opplex IPTV support. Then we will open your chosen contact channel. This does not send a WhatsApp message or save a chat transcript.')}</p>
      <form ref={form} id="landing-contact-form" onSubmit={submitContact} onInvalidCapture={invalidField} onInput={clearValidity} onChange={clearValidity} onReset={() => { Array.from(form.current?.elements || []).forEach(field => field.setCustomValidity?.('')); }} aria-busy={busy}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="contact-fields">
            <label htmlFor="contact-name">{t('Your name')}<input id="contact-name" name="name" autoComplete="name" maxLength={120} required /></label>
            <label htmlFor="contact-email">{t('Email')}<input id="contact-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} required /></label>
            <label htmlFor="contact-phone">{t('Phone, including country code')}<input id="contact-phone" name="phone" type="tel" dir="ltr" autoComplete="tel" placeholder="+92 …" maxLength={32} required aria-describedby="contact-phone-help" /></label>
            <p id="contact-phone-help" className="field-help">{t('Use 8–15 digits including the country code.')}</p>
            <label htmlFor="contact-message">{t('Message')} <span className="field-help">{t('(optional)')}</span><textarea id="contact-message" name="message" rows={3} maxLength={2000} /></label>
          </div>
          <div className="contact-honeypot" aria-hidden="true"><label>{t('Leave this empty')}<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label className="consent-check"><input name="contact_consent" type="checkbox" required /><span><span id="contact-consent-copy">{message(ui, channel === 'whatsapp' ? 'consentWhatsApp' : 'consentChat')}</span> <a href={pathFor(locale, 'privacy-policy')} target="_blank" rel="noopener noreferrer">{t('Read the privacy policy')}</a>.</span></label>
        </fieldset>
        <p className="field-help">{t('This contact permission is separate from optional usage measurement.')}</p>
        <p id="contact-form-status" className="form-status" role="status" aria-live="polite" data-error={hasError}>{status}</p>
        <button id="contact-form-submit" className="button button-primary" type="submit" disabled={busy}>{message(ui, busy ? 'saving' : channel === 'whatsapp' ? 'saveWhatsApp' : 'saveChat')}</button>
        <a className="contact-fallback" href={contactHref}>{t("Or use the main website's contact page")}</a>
      </form>
    </dialog>
    <button id="support-whatsapp" className="floating-whatsapp" type="button" onClick={event => openContact('whatsapp', event.currentTarget)} aria-label={t('Contact us on WhatsApp')} aria-haspopup="dialog"><img src="https://opplexiptv.com/images/whatsapp-img-small.webp" alt="" width={60} height={60} decoding="async" /></button>
    <button ref={chatLauncher} id="support-chat-launcher" className="support-chat-launcher" type="button" onClick={event => openContact('tawk', event.currentTarget)} aria-label={t('Open live chat')} aria-haspopup="dialog" aria-expanded={chatExpanded} disabled={chatBusy} hidden={chatExpanded}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a9 9 0 0 0-7.6 13.8L3 21l4.5-1.3A9 9 0 1 0 12 3Zm-4 8h8v2H8v-2Z" /></svg></button>
    <p id="support-chat-status" className="support-chat-status" role="status" aria-live="polite" hidden={!chatStatus}>{chatStatus}</p>
  </>;
}
