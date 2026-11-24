import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

// Shared shell for Login + Signup: a photo panel with what the product does on the
// left (desktop), the form on the right. Photo: Unsplash (free licence).
const PHOTO = 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1400&q=80';

export default function AuthCard({ title, subtitle, children, footer, badge }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-side" aria-hidden="true">
        <img src={PHOTO} alt="" className="auth-side__img" />
        <div className="auth-side__shade" />
        <div className="auth-side__copy">
          <p className="auth-side__eyebrow">Article Writer for Shopify</p>
          <h2>Blog posts, SEO and Instagram — done while you run your store.</h2>
          <ul>
            <li>Articles with your real product photos</li>
            <li>Store SEO checked and fixed every night</li>
            <li>A fresh Instagram post every day</li>
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-top">
          <Link to="/" className="auth-back"><ChevronLeft size={16} /> Home</Link>
        </div>
        <div className="auth-card">
          <Link to="/" className="auth-logo" aria-label="Article Writer — home">
            <img src="/favicon.svg" alt="" width="44" height="44" />
          </Link>
          {badge && <div className="auth-badge">{badge}</div>}
          <div className="auth-head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="auth-foot">{footer}</div>}
        </div>
        <p className="auth-legal">
          By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </main>
      <style>{`
        .auth-wrap { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); background: var(--bg-page); }
        .auth-side { position: relative; overflow: hidden; background: #111; min-height: 100vh; position: sticky; top: 0; height: 100vh; }
        .auth-side__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .auth-side__shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%); }
        .auth-side__copy { position: absolute; left: 48px; right: 48px; bottom: 48px; color: #fff; }
        .auth-side__eyebrow { font-size: 13px; font-weight: 600; opacity: 0.8; margin-bottom: 10px; }
        .auth-side h2 { color: #fff; font-size: clamp(26px, 2.6vw, 36px); line-height: 1.12; letter-spacing: -0.03em; margin-bottom: 20px; max-width: 520px; }
        .auth-side ul { list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 15px; opacity: 0.88; }
        .auth-side li::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #fff; margin-right: 10px; vertical-align: middle; opacity: 0.8; }
        .auth-main { display: flex; flex-direction: column; align-items: center; padding: 24px; min-height: 100vh; }
        .auth-top { align-self: stretch; }
        .auth-back { display: inline-flex; align-items: center; gap: 2px; color: var(--text-muted); font-size: 14px; }
        .auth-back:hover { color: var(--text-primary); }
        .auth-card { width: 100%; max-width: 400px; margin: auto 0; padding: 32px 0; }
        .auth-logo { display: inline-block; margin-bottom: 24px; }
        .auth-logo img { display: block; border-radius: 11px; }
        .auth-badge { display: inline-block; padding: 4px 12px; border-radius: var(--radius-pill); background: var(--brand-tint); color: var(--brand); font-size: 12.5px; font-weight: 600; margin-bottom: 14px; }
        .auth-head { margin-bottom: 28px; }
        .auth-head h1 { font-size: 32px; letter-spacing: -0.03em; margin-bottom: 6px; }
        .auth-head p { color: var(--text-muted); font-size: 16px; }
        .auth-card .form-input { padding: 12px 14px; font-size: 15px; }
        .auth-card .btn-primary.w-full { padding: 12px 18px; font-size: 15px; margin-top: 4px; }
        .auth-foot { margin-top: 24px; font-size: 14.5px; color: var(--text-muted); }
        .auth-foot a { font-weight: 500; }
        .auth-legal { font-size: 12.5px; color: var(--text-muted); text-align: center; }
        .auth-legal a { color: var(--text-secondary); text-decoration: underline; text-underline-offset: 2px; }
        @media (max-width: 900px) {
          .auth-wrap { grid-template-columns: 1fr; }
          .auth-side { display: none; }
          .auth-card { padding: 16px 0 32px; }
        }
      `}</style>
    </div>
  );
}
