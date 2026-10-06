import React from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';

export default function Privacy() {
  return (
    <div className="legal-page">
      <Seo
        title="Privacy Policy"
        description="How Article Writer collects, stores, and uses your data."
        path="/privacy"
      />
      <Link to="/" className="legal-back">← Back to home</Link>
      <article className="legal-doc">
        <h1>Privacy Policy</h1>
        <p className="legal-muted">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>What we collect</h2>
        <p>Account info (email, name, password hash), Shopify store URL and access token (encrypted at rest), and the Business DNA we generate from your Shopify store's public catalog data. Activity logs of generation, publishing, and admin actions.</p>

        <h2>How we use it</h2>
        <p>Solely to operate the Service: authenticate you, communicate with your Shopify store, generate and publish articles you request, and enforce plan limits. We do not sell your data.</p>

        <h2>Where it lives</h2>
        <p>Data is stored in our managed databases. Shopify credentials and AI keys are encrypted with AES-256-GCM before being written to disk. We do not log secrets.</p>

        <h2>Third parties</h2>
        <p>We call Shopify's Admin API on your behalf using the token you provide, Meta's Instagram Graph API for the Instagram accounts you connect, and AI providers (Google Gemini, DeepSeek) for content generation. Their respective terms apply when we send prompts to them.</p>

        <h2>Instagram</h2>
        <p>When you connect an Instagram account we store its id, username and an encrypted access token, the posts we generate and publish for it (including the images), their engagement metrics, comments on its posts that we review for auto-reply, and a Business DNA built from its public profile. We use the official Instagram Graph API only. Disconnecting the account deletes all of it — see <Link to="/data-deletion">Data Deletion</Link>.</p>

        <h2>Cookies / tokens</h2>
        <p>We use your browser's localStorage to keep you signed in. No third-party tracking cookies on the app itself.</p>

        <h2>Your rights</h2>
        <p>You can export your workspace data and delete your account at any time. Contact us via the support email for any data-access or deletion request.</p>

        <h2>Children</h2>
        <p>The Service isn't intended for users under 16.</p>

        <h2>Changes</h2>
        <p>We may update this policy; material changes will be notified in-app or by email.</p>
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
