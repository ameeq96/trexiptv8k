'use client';

import { useCatalog } from './Catalog';
import { message } from '../lib/api';

export default function VerifiedReviews({ locale }) {
  const { data, loading, error } = useCatalog();
  const ui = data?.experience?.ui || {};
  const rows = Array.isArray(data?.experience?.reviews) ? data.experience.reviews.filter(item =>
    item.verified_purchase === true && item.display_name && item.body && Number.isInteger(item.rating)
    && item.rating >= 1 && item.rating <= 5 && Number.isFinite(new Date(item.published_at).getTime())) : [];
  if (loading || error || !ui.reviewsHeading || !rows.length) return null;
  return <section className="experience-panel verified-reviews" id="customer-reviews" aria-labelledby="customer-reviews-heading">
    <h2 id="customer-reviews-heading">{ui.reviewsHeading}</h2>
    <div className="experience-cards">{rows.map(item => <figure className="verified-review" key={item.id}>
      <p className="review-verification">{ui.verifiedPurchase}</p>
      <p aria-label={message(ui, 'reviewRating', { rating: new Intl.NumberFormat(locale).format(item.rating) })}><span aria-hidden="true">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span></p>
      <blockquote><p>{item.body}</p></blockquote><figcaption>{item.display_name} · <time dateTime={item.published_at}>
        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.published_at))}
      </time></figcaption>
    </figure>)}</div>
  </section>;
}
