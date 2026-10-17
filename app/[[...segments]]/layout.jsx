import '../../styles.css';
import { site, resolveRoute, isRtl } from '../../lib/site.js';

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#010c3a' };

export default async function RootLayout({ children, params }) {
  const { locale } = resolveRoute((await params)?.segments);
  return <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
    <body data-theme={site.theme} data-brand={site.name} data-source={site.source}>{children}</body>
  </html>;
}
