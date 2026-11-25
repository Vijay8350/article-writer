import React, { useId } from 'react';

// The Glowquill mark: a swept quill with its lit half and a soft glow on a cobalt tile.
// One artwork everywhere: public/favicon.svg, public/logo.svg and deploy/brand/ (App Store
// icon) are drawn from the same 64-unit geometry. The tile carries its own colours, so the
// mark reads the same on light and dark surfaces.
const FEATHER = 'M49.6 9.2C40 10.4 29.5 16.5 24.2 26.4L30.4 27.6L22.6 30.6C21.3 34.8 21.2 38.9 22.1 42.6L13.36 53.69Q12.8 54.4 13.51 53.85L24.4 45.4C30 47.4 36.6 45.8 41.4 40.4L35.6 38.6L43.6 36.6C48.8 28.6 50.7 18.6 49.6 9.2ZM45.6 14.2C39.6 22.6 32.4 33 24.4 43.2C32.6 34.6 40.4 24.6 45.6 14.2Z';
const OUTLINE = 'M49.6 9.2C40 10.4 29.5 16.5 24.2 26.4L30.4 27.6L22.6 30.6C21.3 34.8 21.2 38.9 22.1 42.6L13.36 53.69Q12.8 54.4 13.51 53.85L24.4 45.4C30 47.4 36.6 45.8 41.4 40.4L35.6 38.6L43.6 36.6C48.8 28.6 50.7 18.6 49.6 9.2Z';
const LIT = 'M53 5L45.6 14.2C39.6 22.6 32.4 33 24.4 43.2L12.8 54.4L0 66.8L0 0Z';

export function BrandMark({ size = 28, className, title }) {
  // gradient/filter ids must be unique per instance (several marks can share a page)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name) => `gq-${name}-${uid}`;
  const url = (name) => `url(#${id(name)})`;
  return (
    <svg
      className={['brand-mark-svg', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={id('bg')} x1="10" y1="62" x2="54" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#073b8f" />
          <stop offset="1" stopColor="#0b63ce" />
        </linearGradient>
        <radialGradient id={id('glow')} cx="36" cy="27" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8fcaff" stopOpacity=".95" />
          <stop offset=".35" stopColor="#5aa8ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#2f80ed" stopOpacity="0" />
        </radialGradient>
        <filter id={id('blur')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <clipPath id={id('tile')}><rect width="64" height="64" rx="14.5" /></clipPath>
        <clipPath id={id('lit')}><path d={LIT} /></clipPath>
      </defs>
      <g clipPath={url('tile')}>
        <rect width="64" height="64" rx="14.5" fill={url('bg')} />
        <rect width="64" height="64" rx="14.5" fill={url('glow')} />
        <path d={OUTLINE} fill="#8fcaff" opacity=".75" filter={url('blur')} />
        <path d={FEATHER} fill="#d4e7ff" fillRule="evenodd" />
        <path d={FEATHER} fill="#fff" fillRule="evenodd" clipPath={url('lit')} />
      </g>
    </svg>
  );
}

// Mark + the "Glowquill" wordmark. The name scales with the mark and takes the text colour
// token, so it follows Light/Dark. Hide `.brand-logo__name` with CSS to show only the mark.
export function BrandLogo({ size = 28, showName = true, className }) {
  return (
    <span
      className={['brand-logo', className].filter(Boolean).join(' ')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.32), minWidth: 0 }}
    >
      <BrandMark size={size} />
      {showName && (
        <span
          className="brand-logo__name"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: Math.round(size * 0.6 * 10) / 10,
            fontWeight: 650,
            letterSpacing: '-0.025em',
            lineHeight: 1,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          Glowquill
        </span>
      )}
    </span>
  );
}

export default BrandLogo;
