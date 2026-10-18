'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCatalog } from './Catalog';
import { useSupport } from './SupportWidget';
import { centralUrl } from '../lib/api';
import { pathFor } from '../lib/site';

const LOCAL_ROUTES = new Set(['setup', 'iptv-applications', 'faqs']);
const CENTRAL_ROUTES = { account: '/account', support: '/account/support' };

export default function HelpAssistant({ site, locale, pages = [] }) {
  const { data } = useCatalog();
  const { openContact } = useSupport();
  const experience = data?.experience || {};
  const ui = experience.ui || {};
  const help = experience.help || {};
  const [selected, setSelected] = useState({});
  const [query, setQuery] = useState('');
  const id = useId();
  const questions = Array.isArray(help.questions) ? help.questions : [];
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);
  const results = useMemo(() => {
    const needle = normalize(query.trim()).slice(0, 120);
    if (needle.length < 2) return [];
    return pages.filter(page => normalize([page.title, page.intro,
      ...(page.sections || []).map(section => section.heading + ' ' + section.body)].join(' ')).includes(needle)).slice(0, 6);
  }, [query, pages, locale]);
  if (!ui.helpHeading) return null;

  function destination(key) {
    if (LOCAL_ROUTES.has(key)) return pathFor(locale, key);
    return CENTRAL_ROUTES[key] ? centralUrl(CENTRAL_ROUTES[key], site.source) : null;
  }

  return <section className="experience-panel help-assistant" id="help-assistant" aria-labelledby={id + '-heading'}>
    <p className="eyebrow">{site.name}</p>
    <h2 id={id + '-heading'}>{ui.helpHeading}</h2>
    <p>{help.intro || ui.toolsIntro}</p>
    {site.brand === 'geo' ? <div className="help-search">
      <label htmlFor={id + '-search'}>{ui.helpSearch}</label>
      <input id={id + '-search'} type="search" value={query} maxLength={120}
        autoComplete="off" aria-describedby={id + '-hint'}
        onChange={event => setQuery(event.target.value)} />
      <p className="field-help" id={id + '-hint'}>{ui.helpSearchHint}</p>
      {query.trim().length >= 2 && <div aria-live="polite" role="status">
        <p>{results.length ? ui.helpResults : ui.helpNoResults}</p>
        <ul className="help-results">{results.map(page => <li key={page.slug}>
          <Link href={pathFor(locale, page.slug)}>{page.title}</Link><p>{page.description}</p>
        </li>)}</ul>
      </div>}
    </div> : <div className="help-questions">
      {questions.map((question, index) => {
        const options = Array.isArray(question.options) ? question.options : [];
        const option = options.find(item => item.value === selected[question.id]);
        return <fieldset key={question.id || index}>
          <legend>{question.label}</legend>
          <label className="visually-hidden" htmlFor={id + '-question-' + index}>{ui.helpQuestion}</label>
          <select id={id + '-question-' + index} value={selected[question.id] || ''}
            onChange={event => setSelected(current => ({ ...current, [question.id]: event.target.value }))}>
            <option value="">{ui.helpChoose}</option>
            {options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {option && <div className="help-answer" role="status">
            <p>{option.answer}</p>
            <div className="experience-actions">{[...new Set(option.links || [])].map(key => {
              const href = destination(key);
              if (!href) return null;
              const label = key === 'account' ? ui.helpAccount : key === 'support' ? ui.helpSupport
                : pages.find(page => page.slug === key)?.title;
              if (!label) return null;
              return LOCAL_ROUTES.has(key) ? <Link className="text-link" key={key} href={href}>{label}<span aria-hidden="true">→</span></Link>
                : <a className="text-link" key={key} href={href}>{label}<span aria-hidden="true">↗</span></a>;
            })}</div>
          </div>}
        </fieldset>;
      })}
      {Object.values(selected).some(Boolean) && <button className="button button-secondary" type="button"
        onClick={() => setSelected({})}>{ui.helpReset}</button>}
    </div>}
    <p className="field-help">{ui.helpNoDiagnosis}</p>
    <button className="text-link experience-contact" type="button"
      onClick={event => openContact('whatsapp', event.currentTarget)}>{ui.helpContact}<span aria-hidden="true">↗</span></button>
  </section>;
}
