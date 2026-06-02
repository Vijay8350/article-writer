import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

// Shared shell for Login + Signup. Logo on top, form card in the middle,
// link at bottom. On desktop, shows a marketing tagline panel on the side.
export default function AuthCard({ title, subtitle, children, footer, badge }) {
  return (
    <div className="auth-wrap">
      <Link to="/" className="auth-back">← Back to home</Link>
      <div className="auth-grid">
        <aside className="auth-side">
          <Link to="/" className="auth-logo" aria-label="Article Writer — back to home">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>Article Writer</span>
          </Link>
          <h2>SEO blog content on autopilot — for your Shopify store.</h2>
          <ul>
            <li>✓ Real product images embedded automatically</li>
            <li>✓ One-click publish to your Shopify blog</li>
            <li>✓ Daily/monthly category campaigns</li>
            <li>✓ Built-in SEO score on every article</li>
          </ul>
        </aside>
        <main className="auth-main">
          <div className="card auth-card">
            {badge && <div className="auth-badge">{badge}</div>}
            <div className="auth-head">
              <Sparkles size={22} style={{ color: 'var(--accent-primary)' }} />
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="auth-foot">{footer}</div>}
          </div>
        </main>
      </div>
      <style>{`
        .auth-wrap { min-height: 100vh; position: relative; padding: 24px; background: var(--bg-primary); }
        .auth-back { position: absolute; top: 20px; left: 24px; color: var(--text-muted); font-size: 13px; }
        .auth-back:hover { color: var(--text-secondary); }
        .auth-grid { max-width: 1080px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; min-height: calc(100vh - 48px); }
        .auth-side { padding: 24px; }
        .auth-logo { display: inline-flex; align-items: center; gap: 8px; color: var(--text-primary); font-weight: 700; font-size: 18px; margin-bottom: 36px; }
        .auth-side h2 { font-size: clamp(22px, 2.6vw, 30px); line-height: 1.25; letter-spacing: -0.02em; margin-bottom: 22px; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .auth-side ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; color: var(--text-secondary); font-size: 15px; }
        .auth-main { display: flex; justify-content: center; }
        .auth-card { width: 100%; max-width: 420px; padding: 32px; position: relative; }
        .auth-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3); color: var(--text-accent); font-size: 12px; font-weight: 600; margin-bottom: 14px; }
        .auth-head { text-align: center; margin-bottom: 22px; }
        .auth-head h1 { font-size: 22px; margin: 10px 0 4px; }
        .auth-head p { color: var(--text-secondary); font-size: 14px; }
        .auth-foot { text-align: center; margin-top: 20px; font-size: 14px; color: var(--text-secondary); }
        .auth-foot a { color: var(--accent-primary); font-weight: 600; }
        @media (max-width: 880px) {
          .auth-grid { grid-template-columns: 1fr; gap: 24px; }
          .auth-side { display: none; }
          .auth-back { display: none; }
        }
      `}</style>
    </div>
  );
}
