import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="legal-page">
      <Link to="/" className="legal-back">← Back to home</Link>
      <article className="legal-doc">
        <h1>Terms of Service</h1>
        <p className="legal-muted">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>1. Acceptance</h2>
        <p>By creating an account or using Article Writer (the "Service"), you agree to these Terms. If you do not agree, do not use the Service.</p>

        <h2>2. The Service</h2>
        <p>Article Writer generates SEO-optimized blog content for Shopify stores and can publish that content to your connected Shopify blog at your direction. You are responsible for reviewing content before it goes live unless you have explicitly enabled auto-publish.</p>

        <h2>3. Your account</h2>
        <p>You are responsible for keeping your login credentials and Shopify access tokens secure. You must not share your account with people outside your organization, except via the workspace team-invite feature.</p>

        <h2>4. Acceptable use</h2>
        <p>Do not use the Service to publish content that is unlawful, infringing, defamatory, deceptive, or that violates Shopify's terms. We may suspend accounts that materially violate this section.</p>

        <h2>5. Content ownership</h2>
        <p>Articles generated for you are yours to use, edit, and publish. The product images embedded by the Service come from your own Shopify store. We do not claim any ownership of your content.</p>

        <h2>6. Plans and billing</h2>
        <p>Paid plans are billed in advance for the chosen period. You can cancel at any time; cancellation takes effect at the end of the current period. Trial accounts may have feature or usage limits.</p>

        <h2>7. Data export and deletion</h2>
        <p>You may export your workspace data, and you may delete your account at any time. Deletion removes your data per our retention policy and is irreversible.</p>

        <h2>8. Disclaimer</h2>
        <p>The Service is provided "as is". We don't guarantee specific SEO outcomes. AI-generated content may contain errors — review before publishing.</p>

        <h2>9. Changes</h2>
        <p>We may update these Terms; we'll notify you of material changes in-app or by email.</p>

        <h2>10. Contact</h2>
        <p>Questions? Reach out via the support email on the website.</p>
      </article>
      <style>{`
        .legal-page { max-width: 760px; margin: 0 auto; padding: 60px 24px 80px; color: var(--text-primary); }
        .legal-back { display: inline-block; color: var(--text-muted); font-size: 13px; margin-bottom: 28px; }
        .legal-back:hover { color: var(--text-secondary); }
        .legal-doc h1 { font-size: clamp(28px, 4vw, 38px); margin-bottom: 8px; }
        .legal-doc h2 { font-size: 18px; margin: 28px 0 8px; }
        .legal-doc p { color: var(--text-secondary); line-height: 1.7; margin-bottom: 8px; }
        .legal-muted { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }
      `}</style>
    </div>
  );
}
