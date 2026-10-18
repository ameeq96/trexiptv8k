'use client';

import { useCatalog } from './Catalog';

const STATES = { investigating: 'statusInvestigating', identified: 'statusIdentified', monitoring: 'statusMonitoring', resolved: 'statusResolved' };

export default function ServiceUpdates({ locale }) {
  const { data, loading, error } = useCatalog();
  const ui = data?.experience?.ui || {};
  const rows = Array.isArray(data?.experience?.incidents) ? data.experience.incidents.filter(item =>
    item.title && typeof item.body === 'string' && Object.hasOwn(STATES, item.state)
    && Number.isFinite(new Date(item.updated_at).getTime())) : [];
  if (!ui.statusHeading) return null;
  return <section className="experience-panel service-updates" id="service-status" aria-labelledby="service-status-heading">
    <h2 id="service-status-heading">{ui.statusHeading}</h2>
    {loading || error || !rows.length ? <p role="status">{loading ? ui.loadingExperience : error ? ui.statusUnavailable : ui.statusNone}</p>
      : <div className="experience-cards">{rows.map(item => <article className="service-update" key={item.id} data-state={item.state}>
        <p className="service-state">{ui[STATES[item.state]]}</p><h3>{item.title}</h3><p>{item.body}</p>
        <p className="field-help">{ui.statusUpdated} <time dateTime={item.updated_at}>
          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updated_at))}
        </time></p>
      </article>)}</div>}
  </section>;
}
