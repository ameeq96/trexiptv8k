'use client';

import { useCatalog } from './Catalog';
import { message } from '../lib/api';

function safeAsset(value, kind) {
  try {
    const url = new URL(value);
    const allowed = kind === 'image' ? /\.(?:webp|png|jpe?g|gif|avif)$/i : /\.(?:mp4|webm)$/i;
    return ['https://opplexiptv.com', 'https://www.opplexiptv.com'].includes(url.origin) && !url.username && !url.password
      && /^\/(?:images|storage)\//.test(url.pathname) && !url.search && !url.hash
      && allowed.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export default function GuideMedia({ locale, slug }) {
  const { data, loading, error } = useCatalog();
  const ui = data?.experience?.ui || {};
  const media = Array.isArray(data?.experience?.media) ? data.experience.media.filter(item =>
    item.guide_slug === slug && ['image', 'video'].includes(item.kind)
    && item.title && item.device_model && item.player_name && item.player_version
    && Number.isFinite(new Date(item.tested_at).getTime()) && safeAsset(item.media_url, item.kind)) : [];
  if (loading || error || !ui.mediaHeading || !media.length) return null;
  return <section className="experience-panel guide-media" aria-labelledby="guide-media-heading">
    <h2 id="guide-media-heading">{ui.mediaHeading}</h2>
    <div className="experience-cards">{media.map(item => <figure key={item.id}>
      {item.kind === 'video' ? <video controls preload="none" aria-label={item.title} src={safeAsset(item.media_url, item.kind)}>
        <a href={safeAsset(item.media_url, item.kind)}>{ui.mediaUnsupported}</a>
      </video> : <img src={safeAsset(item.media_url, item.kind)} alt={item.alt_text || item.title} loading="lazy" decoding="async" />}
      <figcaption><h3>{item.title}</h3><p>{item.description}</p>
        <dl><div><dt>{ui.mediaDevice}</dt><dd>{item.device_model}</dd></div>
          <div><dt>{ui.mediaPlayer}</dt><dd>{item.player_name} {item.player_version}</dd></div></dl>
        <p className="field-help">{message(ui, 'mediaTested', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.tested_at)) })}</p>
      </figcaption>
    </figure>)}</div>
  </section>;
}
