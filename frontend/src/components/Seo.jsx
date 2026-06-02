import React from 'react';
import { Helmet } from 'react-helmet-async';

// Single source of truth for per-page SEO + social metadata.
// Pass `noindex` for any page you don't want in Google.
// Pass `jsonLd` (object or array) for page-level structured data.
const APP_URL = (import.meta.env.VITE_APP_URL || 'https://tools.apanjob.com').replace(/\/$/, '');
const DEFAULT_IMAGE = `${APP_URL}/favicon.svg`;

export default function Seo({
  title,
  description,
  path = '/',
  image = DEFAULT_IMAGE,
  noindex = false,
  jsonLd,
}) {
  const canonical = `${APP_URL}${path.startsWith('/') ? path : '/' + path}`;
  const fullTitle = title?.endsWith('Article Writer') ? title : `${title} — Article Writer`;
  const robotsContent = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';

  const ld = Array.isArray(jsonLd) ? jsonLd : (jsonLd ? [jsonLd] : []);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robotsContent} />
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {ld.map((obj, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(obj)}
        </script>
      ))}
    </Helmet>
  );
}

export { APP_URL };
