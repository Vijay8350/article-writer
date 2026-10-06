import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo';
import { getDataDeletionStatus } from '../lib/api';

// Public page Meta links to from the Facebook data-deletion callback
// (/api/meta/data-deletion returns a URL here with ?id=<confirmation code>).
export default function DataDeletion() {
  const [params] = useSearchParams();
  const code = params.get('id');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!code) return;
    getDataDeletionStatus(code).then((r) => setStatus(r.data)).catch(() => setStatus({ found: false }));
  }, [code]);

  return (
    <div className="legal-page">
      <Seo title="Data Deletion" description="How to delete the Instagram and Facebook data Article Writer stores." path="/data-deletion" />
      <Link to="/" className="legal-back">← Back to home</Link>
      <article className="legal-doc">
        <h1>Data Deletion</h1>

        {code && (
          <div className="legal-callout">
            <strong>Request {code}</strong>
            <p>
              {status == null ? 'Checking…'
                : status.found ? `Received ${new Date(status.receivedAt).toLocaleString()}. Your Instagram data will be deleted within 30 days.`
                  : "We couldn't find a request with this code. If you just submitted it, try again in a minute."}
            </p>
          </div>
        )}

        <h2>What we store from Instagram and Facebook</h2>
        <p>
          For each Instagram account you connect: its id, username, an encrypted access token, the posts we generate and publish for it,
          their engagement metrics, comments on its posts that we review for auto-reply, and the Business DNA built from its public profile.
        </p>

        <h2>Delete it yourself, right away</h2>
        <p>
          Sign in, open <strong>Instagram → Accounts</strong> and click <strong>Disconnect</strong> on the account. That permanently deletes
          its token and everything listed above, including generated images.
        </p>

        <h2>Removed the app from Facebook?</h2>
        <p>
          When you remove Article Writer in your Facebook settings (Settings &amp; privacy → Apps and websites), Facebook notifies us and you
          get a confirmation code to check here. We delete the associated Instagram data within 30 days.
        </p>

        <h2>Questions</h2>
        <p>Contact us through the support email listed on our <Link to="/privacy">privacy policy</Link>.</p>
      </article>
      <style>{`
        .legal-page { max-width: 760px; margin: 0 auto; padding: 60px 24px 80px; color: var(--text-primary); }
        .legal-back { display: inline-block; color: var(--text-muted); font-size: 13px; margin-bottom: 28px; }
        .legal-back:hover { color: var(--text-secondary); }
        .legal-doc h1 { font-size: clamp(28px, 4vw, 38px); margin-bottom: 16px; }
        .legal-doc h2 { font-size: 18px; margin: 28px 0 8px; }
        .legal-doc p { color: var(--text-secondary); line-height: 1.7; margin-bottom: 8px; }
        .legal-callout { border: 1px solid var(--border-primary); border-radius: var(--radius-md); padding: 16px; margin-bottom: 8px; }
      `}</style>
    </div>
  );
}
