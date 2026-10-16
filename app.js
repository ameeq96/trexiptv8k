const isLocalPage = ['http:', 'https:'].includes(globalThis.location?.protocol)
  && ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname);
export const API_ORIGIN = isLocalPage ? 'http://127.0.0.1:8001' : 'https://opplexiptv.com';

const BRAND_BY_SOURCE = {
  trexiptv8k: 'trex',
  'opplexiptv-store': 'opplex',
  geoiptv: 'geo',
  '5gliveiptv': '5g',
};

export function centralUrl(path, source = '') {
  let url;
  try { url = new URL(path, API_ORIGIN); } catch { return null; }
  if (url.origin !== API_ORIGIN || url.protocol !== (isLocalPage ? 'http:' : 'https:') ||
      url.username || url.password) return null;
  if (source) {
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'landing');
  }
  return url.href;
}

export function checkoutUrl(id, source) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return centralUrl(`/checkout?package_id=${id}`, source);
}

export function brandForSource(source) {
  return Object.hasOwn(BRAND_BY_SOURCE, source) ? BRAND_BY_SOURCE[source] : null;
}

export function availablePlans(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter(plan => {
    if (!plan || plan.type !== 'iptv' || plan.is_available !== true ||
        !Number.isSafeInteger(plan.id) || plan.id <= 0 || seen.has(plan.id) ||
        !Number.isFinite(Number(plan.price_amount)) || Number(plan.price_amount) <= 0 ||
        !Number.isSafeInteger(plan.duration_months) || plan.duration_months <= 0 ||
        typeof plan.currency !== 'string' || !/^[A-Z]{3}$/.test(plan.currency)) return false;
    seen.add(plan.id);
    return true;
  }).map(plan => ({
    ...plan,
    price: money(Number(plan.price_amount), plan.currency),
  })).sort((a, b) => a.duration_months - b.duration_months);
}

export function money(amount, currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
}

export async function getApiData(path, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const url = centralUrl(`/api/v1/site/${path}`);
    if (!url) throw new Error('Invalid API destination');
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Catalog unavailable');
    const body = await response.json();
    if (!body?.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      throw new Error('Invalid catalog response');
    }
    return body.data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}


function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function postLanding(path, data, keepalive = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(centralUrl(`/api/v1/landing/${path}`), {
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
      keepalive,
    });
    if (!response.ok) {
      const error = new Error(response.status === 429
        ? 'Too many attempts. Please wait a little before trying again.'
        : response.status === 409
          ? 'An earlier request may already be saved. Close this form and reopen it if you need to change or resend your details.'
        : 'We could not save your enquiry. Please retry or use the main contact page.');
      if (response.status === 422) {
        const body = await response.json().catch(() => ({}));
        error.fields = body.errors;
      }
      throw error;
    }
    const body = await response.json();
    if (body.ok !== true) throw new Error('Your enquiry was not confirmed as saved. Please retry.');
  } finally {
    clearTimeout(timeout);
  }
}

function startExperience() {
  const byId = id => document.getElementById(id);
  const brand = brandForSource(document.body.dataset.source);
  const dialog = byId('contact-dialog');
  const form = byId('landing-contact-form');
  const status = byId('contact-form-status');
  const submit = byId('contact-form-submit');
  const privacy = byId('privacy-dialog');
  let analyticsAllowed = false;
  let sessionId;
  let visitTracked = false;
  let eventId;
  let channel;
  let complete;
  let opener;
  let pending = false;
  try { analyticsAllowed = localStorage.getItem('landing-measurement-v1') === 'allowed'; } catch {}

  function session() {
    if (!analyticsAllowed) return null;
    if (!sessionId) {
      try { sessionId = sessionStorage.getItem('landing-session-v1'); } catch {}
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId || '')) {
        sessionId = newRequestId();
        try { sessionStorage.setItem('landing-session-v1', sessionId); } catch {}
      }
    }
    return sessionId;
  }

  function track(event, packageId) {
    if (!analyticsAllowed || !brand) return;
    const data = { brand, event_id: newRequestId(), session_id: session(), event, analytics_consent: true, website: '' };
    if (Number.isSafeInteger(packageId) && packageId > 0) data.package_id = packageId;
    void postLanding('events', data, true).catch(() => {});
  }

  function trackVisit() {
    if (!analyticsAllowed || visitTracked) return;
    visitTracked = true;
    track('visit');
  }

  function checkoutLink(packageId, source) {
    const href = checkoutUrl(packageId, source);
    if (!href || !analyticsAllowed) return href;
    const url = new URL(href);
    url.searchParams.set('landing_consent', '1');
    url.searchParams.set('landing_session', session());
    return url.href;
  }

  function refreshCheckoutLinks() {
    document.querySelectorAll('[data-checkout-package]').forEach(link => {
      const href = checkoutLink(Number(link.dataset.checkoutPackage), link.dataset.checkoutSource);
      if (href) link.href = href;
    });
  }

  function consentStatus() {
    byId('analytics-consent-status').textContent = analyticsAllowed
      ? 'Optional usage measurement is on for this website.'
      : 'Optional usage measurement is off for this website.';
  }

  function chooseAnalytics(allowed) {
    analyticsAllowed = allowed;
    try { localStorage.setItem('landing-measurement-v1', allowed ? 'allowed' : 'declined'); } catch {}
    if (!allowed) {
      sessionId = null;
      visitTracked = false;
      try { sessionStorage.removeItem('landing-session-v1'); } catch {}
    }
    consentStatus();
    refreshCheckoutLinks();
    trackVisit();
    privacy.close();
  }

  byId('privacy-settings-button').addEventListener('click', () => {
    consentStatus();
    privacy.showModal();
  });
  byId('privacy-dialog-close').addEventListener('click', () => privacy.close());
  byId('analytics-allow').addEventListener('click', () => chooseAnalytics(true));
  byId('analytics-decline').addEventListener('click', () => chooseAnalytics(false));
  privacy.addEventListener('close', () => byId('privacy-settings-button').focus());

  function requestContact(nextChannel, trigger, onSaved) {
    if (pending) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    channel = nextChannel;
    complete = onSaved;
    opener = trigger;
    eventId = newRequestId();
    status.textContent = '';
    status.dataset.error = 'false';
    submit.textContent = nextChannel === 'whatsapp' ? 'Save and open WhatsApp' : 'Save and open live chat';
    byId('contact-consent-copy').textContent = nextChannel === 'whatsapp'
      ? 'I agree that Opplex IPTV may store these details and contact me on WhatsApp about this enquiry, not for marketing.'
      : 'I agree that Opplex IPTV may store these details and handle my live-chat enquiry. This does not give permission for WhatsApp contact.';
    dialog.showModal();
    byId('contact-name').focus();
  }

  byId('contact-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    complete = null;
    if (!pending) form.reset();
    opener?.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    const fields = new FormData(form);
    const phone = String(fields.get('phone') || '').trim();
    if (!/^[+\d\s()-]+$/.test(phone) || !/^\d{8,15}$/.test(phone.replace(/\D/g, ''))) {
      status.textContent = 'Enter a phone number with 8–15 digits, including your country code.';
      status.dataset.error = 'true';
      byId('contact-phone').focus();
      return;
    }
    pending = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Saving your enquiry…';
    status.dataset.error = 'false';
    const payload = {
      brand, event_id: eventId, name: String(fields.get('name') || '').trim(),
      email: String(fields.get('email') || '').trim(), phone,
      message: String(fields.get('message') || '').trim(), channel,
      contact_consent: fields.get('contact_consent') === 'on', analytics_consent: analyticsAllowed,
      website: String(fields.get('website') || ''),
    };
    if (analyticsAllowed) payload.session_id = session();
    try {
      await postLanding('leads', payload);
      const onSaved = complete;
      const shouldOpen = dialog.open && typeof onSaved === 'function';
      status.textContent = 'Your enquiry is saved.';
      form.reset();
      dialog.close();
      if (shouldOpen) onSaved();
    } catch (error) {
      const invalidField = ['name', 'email', 'phone', 'message', 'contact_consent'].find(key => error.fields?.[key]);
      status.textContent = invalidField
        ? `Please check the ${invalidField.replace('_', ' ')} field and try again.`
        : (error.name === 'AbortError' ? 'Saving took too long. Please retry; the same request will not create a duplicate.' : error.message);
      status.dataset.error = 'true';
      if (invalidField) form.elements.namedItem(invalidField)?.focus();
    } finally {
      pending = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });

  byId('support-whatsapp').addEventListener('click', event => {
    event.preventDefault();
    requestContact('whatsapp', event.currentTarget, () => {
      window.location.assign(byId('support-whatsapp').href);
    });
  });
  document.querySelectorAll('[data-central-path]').forEach(link => {
    const href = centralUrl(link.dataset.centralPath, document.body.dataset.source);
    if (href) link.href = href;
  });
  trackVisit();
  return { requestContact, track, checkoutLink };
}

function startSupport(requestContact) {
  const launcher = document.getElementById('support-chat-launcher');
  const status = document.getElementById('support-chat-status');
  if (!launcher || !status) return;
  const mobile = window.matchMedia('(max-width: 768px)');
  const api = window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();
  api.customStyle = {
    visibility: {
      desktop: { position: 'br', xOffset: 20, yOffset: 20 },
      mobile: { position: 'br', xOffset: 10, yOffset: 10 },
    },
  };
  let ready = false;
  let loading = false;
  let requested = false;
  let timer;
  launcher.hidden = false;

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }
  function closeChat() {
    requested = false;
    api.hideWidget();
    launcher.hidden = false;
    launcher.setAttribute('aria-expanded', 'false');
  }
  function openChat() {
    api.showWidget();
    api.maximize();
  }
  api.onBeforeLoad = () => { if (!requested) api.hideWidget(); };
  api.onLoad = () => {
    ready = true;
    loading = false;
    clearTimeout(timer);
    launcher.disabled = false;
    showStatus('');
    if (requested) openChat();
    else closeChat();
  };
  api.onChatMaximized = () => {
    if (!requested) {
      api.minimize();
      closeChat();
      return;
    }
    launcher.hidden = true;
    launcher.setAttribute('aria-expanded', 'true');
    showStatus('');
  };
  api.onChatMinimized = () => {
    closeChat();
    launcher.focus();
  };

  function loadWidget() {
    if (loading || ready) return;
    loading = true;
    const script = document.createElement('script');
    script.id = 'landing-tawk-embed';
    script.async = true;
    script.src = 'https://embed.tawk.to/6ac929cd7f1f3634beb0e4f6/1k4gsmj54';
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    script.onerror = () => {
      if (ready) return;
      loading = false;
      clearTimeout(timer);
      launcher.disabled = false;
      launcher.hidden = false;
      showStatus('Chat could not load. Tap the chat icon to retry, or use WhatsApp.');
      script.remove();
    };
    timer = setTimeout(() => {
      if (ready) return;
      launcher.disabled = false;
      launcher.hidden = false;
      showStatus('Chat is taking longer to load. You can use WhatsApp for support.');
    }, 15000);
    document.head.appendChild(script);
  }

  launcher.addEventListener('click', () => {
    requestContact('tawk', launcher, () => {
      requested = true;
      if (ready) {
        openChat();
        return;
      }
      if (loading) {
        showStatus('Chat is still loading. You can use WhatsApp for support.');
        return;
      }
      launcher.disabled = true;
      showStatus('Opening live chat…');
      loadWidget();
    });
  });
  if (!mobile.matches) loadWidget();
}

function startLanding(experience) {
  const byId = id => document.getElementById(id);
  const source = document.body.dataset.source;
  const brand = brandForSource(source);
  let request;
  let version = 0;
  const contentFallbacks = Array.from(document.querySelectorAll(
    '#hero-heading, .hero-description, #yearly-guide-heading, .yearly-guide .guide-heading > p:last-child, .guide-columns, #getting-started-heading, .getting-started .section-heading > p, .getting-started-grid, #comparison-guide-heading, .comparison-guide .heading-note, .comparison-guide-grid, #connection-guide-heading, .connection-guide-intro, .connection-guide-grid'
  ), node => ({ node, template: node.cloneNode(true) }));
  byId('year').textContent = new Date().getFullYear();
  byId('support-link').href = centralUrl('/contact', source);

  function renderSupport(data) {
    const settings = data.support || {};
    const email = typeof settings.email === 'string' ? settings.email.trim() : '';
    const digits = typeof settings.phone === 'string' ? settings.phone.replace(/\D/g, '') : '';
    const emailLink = byId('support-email');
    const phoneLink = byId('support-phone');
    emailLink.hidden = true;
    phoneLink.hidden = true;
    if (/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
      emailLink.href = `mailto:${email}`;
      emailLink.textContent = email;
      emailLink.hidden = false;
    }
    if (/^\d{7,15}$/.test(digits)) {
      phoneLink.href = `tel:+${digits}`;
      phoneLink.textContent = typeof settings.phone_display === 'string' ? settings.phone_display : `+${digits}`;
      phoneLink.hidden = false;
      const link = new URL(byId('support-whatsapp').href);
      link.pathname = `/${digits}`;
      byId('support-whatsapp').href = link.href;
    }
    const allowed = ['/terms-of-service', '/privacy-policy', '/refund-policy'];
    if (Array.isArray(data.links?.legal)) {
      const anchors = data.links.legal.flatMap(link => {
        if (!link || !allowed.includes(link.url) || typeof link.label !== 'string') return [];
        const anchor = element('a', '', link.label);
        anchor.href = centralUrl(link.url);
        return [anchor];
      });
      if (anchors.length) byId('legal-links').replaceChildren(...anchors);
    }
  }

  function renderContent(content) {
    contentFallbacks.forEach(({ node, template }) => {
      node.replaceChildren(...Array.from(template.childNodes, child => child.cloneNode(true)));
      node.className = template.className;
    });
    const originalQuestions = document.querySelector('.connection-questions');
    if (originalQuestions) originalQuestions.hidden = false;
    byId('faq-list').replaceChildren();
    byId('feature-grid').replaceChildren();
    byId('faq-section').hidden = true;
    byId('features-section').hidden = true;
    if (!content || typeof content !== 'object') return;
    const faqRows = Array.isArray(content.faqs) ? content.faqs : [];
    faqRows.slice(0, 8).forEach(row => {
      if (typeof row?.question !== 'string' || typeof row.answer !== 'string') return;
      const details = element('details', 'faq-item');
      details.append(element('summary', '', row.question), element('p', 'faq-answer', row.answer));
      byId('faq-list').append(details);
    });
    byId('faq-section').hidden = byId('faq-list').childElementCount === 0;
    const highlights = Array.isArray(content.highlights) ? content.highlights : [];
    highlights.filter(text => typeof text === 'string').slice(0, 6).forEach((text, index) => {
      const card = element('article', 'feature-card');
      card.append(element('span', 'feature-number', String(index + 1).padStart(2, '0')), element('h3', '', text));
      byId('feature-grid').append(card);
    });
    byId('features-section').hidden = byId('feature-grid').childElementCount === 0;
    if (typeof content.hero_heading === 'string' && content.hero_heading.trim()) byId('hero-heading').textContent = content.hero_heading;
    const heroDescription = document.querySelector('.hero-description');
    if (heroDescription && typeof content.hero_description === 'string' && content.hero_description.trim()) heroDescription.textContent = content.hero_description;
    const guides = {
      trex: ['#yearly-guide-heading', '.yearly-guide .guide-heading > p:last-child', '.guide-columns'],
      opplex: ['#getting-started-heading', '.getting-started .section-heading > p', '.getting-started-grid'],
      geo: ['#comparison-guide-heading', '.comparison-guide .heading-note', '.comparison-guide-grid'],
      '5g': ['#connection-guide-heading', '.connection-guide-intro', '.connection-guide-grid'],
    };
    const selectors = guides[brand];
    if (!selectors) return;
    const rows = Array.isArray(content.guide_sections) ? content.guide_sections.filter(row =>
      typeof row?.heading === 'string' && typeof row.body === 'string') : [];
    const target = document.querySelector(selectors[2]);
    if (!target || !rows.length) return;
    const heading = document.querySelector(selectors[0]);
    const intro = document.querySelector(selectors[1]);
    if (heading && typeof content.guide_heading === 'string' && content.guide_heading.trim()) heading.textContent = content.guide_heading;
    if (intro && typeof content.guide_intro === 'string') intro.textContent = content.guide_intro;
    target.replaceChildren(...rows.map(row => {
      const article = element('article', 'curated-guide-section');
      article.append(element('h3', '', row.heading), element('p', '', row.body));
      return article;
    }));
    target.classList.add('curated-guide-sections');
    if (brand === '5g') {
      const questions = document.querySelector('.connection-questions');
      if (questions && faqRows.length) questions.hidden = true;
    }
  }

  function renderComparison(plans, providerName) {
    byId('plan-comparison')?.remove();
    const section = element('section', 'plan-comparison');
    section.id = 'plan-comparison';
    const heading = element('h3', '', 'Compare the full term');
    heading.id = 'plan-comparison-heading';
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading, element('p', '', 'Monthly equivalent = plan total ÷ months. This is a comparison only, not monthly billing. Check the final amount and any fees at checkout.'));
    const scroll = element('div', 'comparison-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Plan comparison; scroll horizontally if needed');
    const table = element('table');
    table.append(element('caption', '', `${providerName} · current available plans`));
    const head = element('thead');
    const labels = element('tr');
    ['Term', 'Plan total', 'Monthly equivalent', 'Connections'].forEach(label => {
      const cell = element('th', '', label);
      cell.scope = 'col';
      labels.append(cell);
    });
    head.append(labels);
    const body = element('tbody');
    plans.forEach(plan => {
      const row = element('tr');
      const term = element('th', '', `${plan.duration_months} ${plan.duration_months === 1 ? 'month' : 'months'}`);
      term.scope = 'row';
      row.append(term, element('td', '', plan.price),
        element('td', '', money(Number(plan.price_amount) / plan.duration_months, plan.currency)),
        element('td', '', Number.isSafeInteger(plan.max_devices) && plan.max_devices > 0 ? String(plan.max_devices) : 'Confirm with support'));
      body.append(row);
    });
    table.append(head, body);
    scroll.append(table);
    section.append(scroll);
    byId('plan-grid').after(section);
  }

  function renderPlan(plan, providerName) {
    const card = element('article', 'plan-card');
    const duration = `${plan.duration_months} ${plan.duration_months === 1 ? 'month' : 'months'}`;
    card.append(element('p', 'plan-provider', providerName), element('h3', 'plan-duration', duration),
      element('p', 'plan-price', plan.price), element('p', 'plan-description', `For the full ${duration} plan`));
    const facts = element('ul', 'plan-features');
    facts.append(element('li', '', 'Review the final amount and any fees at checkout'));
    facts.append(element('li', '', Number.isSafeInteger(plan.max_devices) && plan.max_devices > 0
      ? `${plan.max_devices} simultaneous ${plan.max_devices === 1 ? 'connection' : 'connections'}`
      : 'Confirm the connection allowance with support'));
    card.append(facts);
    const checkout = element('a', 'button button-primary plan-cta', 'Continue to checkout');
    checkout.href = experience.checkoutLink(plan.id, source);
    checkout.dataset.checkoutPackage = String(plan.id);
    checkout.dataset.checkoutSource = source;
    checkout.setAttribute('aria-label', `Continue to checkout: ${providerName}, ${duration}, ${plan.price}`);
    checkout.addEventListener('click', () => experience.track('checkout_clicked', plan.id));
    card.append(checkout);
    return card;
  }

  function showPlanError(message) {
    byId('plan-grid').setAttribute('aria-busy', 'false');
    byId('catalog-status').textContent = message;
    byId('api-status').textContent = 'Catalog unavailable';
    byId('hero-plan').textContent = 'Check availability with support';
    byId('retry-catalog').hidden = false;
  }

  async function loadDevices(signal, currentVersion) {
    try {
      const data = await getApiData('configure?locale=en', signal);
      if (currentVersion !== version) return;
      const list = byId('device-list');
      list.replaceChildren();
      if (Array.isArray(data.devices)) data.devices.forEach(device => {
        if (typeof device?.name === 'string') list.append(element('span', 'device-chip', device.name));
      });
      byId('devices-status').textContent = list.childElementCount
        ? 'Check your exact device and player with support before purchasing. A listed device is not a compatibility guarantee.'
        : 'Contact support to check your device.';
    } catch {
      if (currentVersion === version) byId('devices-status').textContent = 'Device information is temporarily unavailable. Contact support for help.';
    }
  }

  async function loadCatalog() {
    request?.abort();
    request = new AbortController();
    const currentVersion = ++version;
    byId('plan-grid').replaceChildren();
    byId('plan-grid').setAttribute('aria-busy', 'true');
    byId('plan-comparison')?.remove();
    byId('hero-price').textContent = '—';
    byId('hero-plan').textContent = 'Loading current plans';
    byId('hero-provider').textContent = '';
    byId('plan-summary').textContent = '';
    byId('provider-options').replaceChildren();
    byId('retry-catalog').hidden = true;
    byId('catalog-status').textContent = 'Loading current brand plans from Opplex IPTV…';
    byId('api-status').textContent = 'Connecting to catalog';
    byId('devices-status').textContent = 'Loading device information…';
    renderContent(null);
    if (!brand) {
      showPlanError('This page has no configured brand. Please contact support.');
      byId('retry-catalog').hidden = true;
      return;
    }
    void loadDevices(request.signal, currentVersion);
    try {
      const data = await getApiData(`brands/${brand}/content?locale=en`, request.signal);
      if (currentVersion !== version) return;
      if (data.brand !== brand || typeof data.provider_name !== 'string' || !data.provider_name.trim()) throw new Error('Unexpected catalog');
      renderSupport(data);
      renderContent(data.content);
      const plans = availablePlans(data.packages);
      if (!plans.length) {
        showPlanError('No available plans for this brand right now. Please retry or contact support.');
        return;
      }
      const providerName = data.provider_name.trim();
      byId('provider-options').setAttribute('aria-label', 'Current brand');
      byId('provider-options').replaceChildren(element('span', 'provider-button', providerName));
      byId('plan-grid').replaceChildren(...plans.map(plan => renderPlan(plan, providerName)));
      byId('plan-grid').setAttribute('aria-busy', 'false');
      byId('catalog-status').textContent = `${plans.length} ${plans.length === 1 ? 'plan' : 'plans'} available from ${providerName}.`;
      byId('api-status').textContent = 'Catalog connected';
      byId('plan-summary').textContent = 'Current catalog prices. Review the final total and any fees at checkout.';
      byId('hero-price').textContent = plans[0].price;
      byId('hero-plan').textContent = `${plans[0].duration_months} ${plans[0].duration_months === 1 ? 'month' : 'months'} · current plan`;
      byId('hero-provider').textContent = providerName;
      renderComparison(plans, providerName);
    } catch {
      if (currentVersion === version) showPlanError('We could not load current prices. Please retry or contact support.');
    }
  }

  byId('retry-catalog').addEventListener('click', () => { void loadCatalog(); });
  void loadCatalog();
}

if (typeof document !== 'undefined') {
  const experience = startExperience();
  startSupport(experience.requestContact);
  startLanding(experience);
}
