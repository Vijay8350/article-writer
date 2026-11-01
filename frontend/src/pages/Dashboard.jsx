import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Dna, PenLine, Instagram, Sparkles, MessageCircle, Rocket, CalendarClock, RefreshCw,
  CheckCircle2, AlertCircle, ExternalLink, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getDashboard } from '../lib/api';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';

// Analytics overview for the active workspace: blog articles + Instagram, last 30 days.

const shortDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const monthLabel = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};
const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
const sumBy = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

const ACTIVITY_LABEL = {
  generate: ['Article written', 'badge-info'],
  publish: ['Article published', 'badge-success'],
  save_draft: ['Article saved as draft', 'badge-purple'],
  campaign_published: ['Campaign article published', 'badge-success'],
  campaign_draft: ['Campaign article drafted', 'badge-purple'],
  campaign_failed: ['Campaign article failed', 'badge-danger'],
  campaign_skipped_duplicate: ['Campaign topic skipped (duplicate)', 'badge-warning'],
  campaign_limit_reached: ['Campaign stopped (plan limit)', 'badge-danger'],
  product_post_published: ['Product posted to Instagram', 'badge-success'],
  product_post_failed: ['Product post failed', 'badge-danger'],
  studio_published: ['Studio post published', 'badge-success'],
  studio_ready: ['Studio post passed quality check', 'badge-info'],
  studio_qa_failed: ['Studio post failed quality check', 'badge-danger'],
};

function Section({ title, right, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      <div className="card-header"><h3>{title}</h3>{right}</div>
      <div className="card-body">{children}</div>
    </div>
  );
}

// Plan meter: used vs limit, colored by how close to the limit.
function Meter({ label, used, limit, to }) {
  const p = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = p >= 100 ? 'var(--accent-danger)' : p >= 80 ? 'var(--accent-warning)' : 'var(--accent-primary)';
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex items-center justify-between" style={{ fontSize: 13, marginBottom: 6 }}>
        <Link to={to} style={{ color: 'var(--text-secondary)' }}>{label}</Link>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{used} / {limit}</strong>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(139, 92, 246, 0.12)' }} role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}>
        <div style={{ width: `${p}%`, height: '100%', borderRadius: 4, background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function SetupItem({ ok, label, to, cta }) {
  return (
    <div className="flex items-center justify-between gap-12 ig-list-row" style={{ padding: '10px 0' }}>
      <span className="flex items-center gap-8" style={{ fontSize: 14 }}>
        {ok ? <CheckCircle2 size={16} style={{ color: 'var(--accent-success)' }} aria-label="done" />
          : <AlertCircle size={16} style={{ color: 'var(--accent-warning)' }} aria-label="to do" />}
        {label}
      </span>
      {!ok && <Link to={to} className="btn btn-secondary btn-sm">{cta}</Link>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getDashboard()
      .then((r) => setData(r.data))
      .catch((err) => toast.error(err.response?.data?.error || 'Could not load the dashboard'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading && !data) {
    return <div className="page-container fade-in"><div className="empty-state"><div className="spinner spinner-lg" /><p>Loading dashboard…</p></div></div>;
  }
  if (!data) return <div className="page-container"><div className="empty-state"><p>Nothing to show.</p></div></div>;

  const { setup, usage, articles, instagram, activity } = data;
  const setupDone = setup.storeConnected && setup.dnaReady;
  const articleDaily = articles.daily.map((d) => ({ key: d.day, label: shortDate(d.day), title: shortDate(d.day), value: d.generated, extra: d.published ? `${d.published} published` : null }));
  const igDaily = instagram.daily.map((d) => ({ key: d.day, label: shortDate(d.day), title: shortDate(d.day), value: d.published, extra: d.failed ? `${d.failed} failed` : null }));
  const monthly = articles.byMonth.map((m) => ({ key: m.period, label: monthLabel(m.period), title: monthLabel(m.period), value: m.articles, extra: m.ig_posts ? `${m.ig_posts} Instagram posts` : null }));
  const igTotal = instagram.product_posts + instagram.studio_posts;
  const campaignArticles = Object.fromEntries(articles.campaigns.articles.map((r) => [r.status, r.n]));
  const scheduled = Object.fromEntries(articles.scheduled.map((r) => [r.status, r.n]));
  const q = instagram.quality;
  const campaignRows = [
    { key: 'published', label: 'Published', value: campaignArticles.published || 0 },
    { key: 'draft', label: 'Saved as draft', value: campaignArticles.draft || 0 },
    { key: 'skipped', label: 'Skipped (duplicate topic)', value: campaignArticles.skipped_duplicate || 0 },
    { key: 'failed', label: 'Failed', value: (campaignArticles.failed || 0) + (campaignArticles.limit_reached || 0) },
  ].filter((r) => r.value > 0);
  const igMix = [
    { key: 'product', label: 'Product posts (scheduler)', value: instagram.product_posts },
    { key: 'studio', label: 'AI quote posts (Studio)', value: instagram.studio_posts },
  ].filter((r) => r.value > 0);

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>📊 Dashboard</h1>
          <p>What your workspace has produced — blog articles and Instagram — over the last 30 days.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* Headline numbers */}
      <div className="kpi-grid mb-24">
        <Kpi label="Articles written (30d)" value={compact(articles.generated_30d)} sub={`${compact(articles.generated)} all time`} />
        <Kpi label="Articles published (30d)" value={compact(articles.published_30d)} sub={`${compact(articles.drafts)} drafts all time`} />
        <Kpi label="Instagram posts" value={compact(igTotal)} sub={`${compact(sumBy(instagram.daily, 'published'))} in the last 30 days`} />
        <Kpi label="Quality gate pass rate" value={q.checked ? pct(q.passed, q.checked) : '—'} sub={q.checked ? `${q.checked} images checked · avg score ${q.avg_score}` : 'No Studio images yet'} />
        <Kpi label="Comment replies (30d)" value={compact(instagram.replies_30d)} sub={instagram.comments_waiting ? `${instagram.comments_waiting} waiting for you` : 'Nothing waiting'} />
        <Kpi label="Active automations" value={compact(instagram.active_jobs + (articles.campaigns.campaigns.find((c) => c.status === 'active')?.n || 0))} sub={`${instagram.active_jobs} Instagram jobs · ${articles.campaigns.campaigns.find((c) => c.status === 'active')?.n || 0} blog campaigns`} />
      </div>

      {/* Setup — only until everything is connected */}
      {!setupDone && (
        <Section title="🚀 Get set up" className="mb-24">
          <SetupItem ok={setup.storeConnected} label={setup.storeConnected ? `Shopify store connected (${setup.storeUrl})` : 'Connect your Shopify store'} to="/settings" cta="Connect" />
          <SetupItem ok={setup.dnaReady} label={setup.dnaReady ? `Business DNA ready — ${setup.dnaProducts} products, ${setup.dnaArticles} articles` : 'Fetch your Business DNA so articles link to real products'} to="/business-dna" cta="Fetch" />
          <SetupItem ok={setup.instagramAccounts > 0} label={setup.instagramAccounts > 0 ? `${setup.instagramAccounts} Instagram account${setup.instagramAccounts === 1 ? '' : 's'} connected` : 'Connect an Instagram account (optional)'} to="/instagram" cta="Connect" />
        </Section>
      )}

      <div className="ig-two-col mb-24">
        <Section title="📝 Articles written per day" right={<span className="badge badge-info">30 days</span>}>
          {sumBy(articles.daily, 'generated') === 0
            ? <p className="form-helper">No articles in the last 30 days. <Link to="/generate">Write one</Link> or start a <Link to="/campaigns">campaign</Link>.</p>
            : <ColumnChart data={articleDaily} label="Day" valueLabel="Articles written" />}
        </Section>
        <Section title="📸 Instagram posts per day" right={<span className="badge badge-info">30 days</span>}>
          {sumBy(instagram.daily, 'published') === 0 && sumBy(instagram.daily, 'failed') === 0
            ? <p className="form-helper">No Instagram posts yet. Add a job in the <Link to="/instagram-scheduler">Product Scheduler</Link> or generate one in the <Link to="/instagram-studio">Studio</Link>.</p>
            : <ColumnChart data={igDaily} label="Day" valueLabel="Posts published" />}
        </Section>
      </div>

      <div className="ig-two-col mb-24">
        <Section title="📅 Monthly output" right={<Link to="/plan" className="btn btn-ghost btn-sm">Plan &amp; usage</Link>}>
          <Meter label={`Articles this month (${usage.planName} plan)`} used={usage.used} limit={usage.limit} to="/plan" />
          <Meter label="Instagram Studio posts this month" used={usage.igUsed} limit={usage.igLimit} to="/plan" />
          <div style={{ marginTop: 18 }}>
            <div className="kpi-section-title">Articles by month</div>
            {sumBy(articles.byMonth, 'articles') === 0
              ? <p className="form-helper">No articles in the last 6 months.</p>
              : <ColumnChart data={monthly} height={140} label="Month" valueLabel="Articles" />}
          </div>
        </Section>
        <Section title="🎯 Quality &amp; outcomes">
          <div className="kpi-section-title">Instagram Studio quality gate</div>
          {q.checked ? (
            <div className="kpi-grid mb-24" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              <Kpi label="Passed" value={pct(q.passed, q.checked)} sub={`${q.passed} of ${q.checked}`} />
              <Kpi label="Avg score" value={q.avg_score ?? '—'} sub="out of 100" />
              <Kpi label="Avg attempts" value={q.avg_attempts ?? '—'} sub="images per post" />
            </div>
          ) : <p className="form-helper mb-16">No images checked yet.</p>}
          <div className="kpi-section-title">Blog campaign articles</div>
          <BarList rows={campaignRows} total={campaignRows.reduce((s, r) => s + r.value, 0)} label="Campaign article outcomes" empty="No campaign articles yet." />
          {(scheduled.pending || scheduled.failed) ? (
            <p className="form-helper" style={{ marginTop: 12 }}>
              Scheduled posts: {scheduled.pending || 0} pending{scheduled.failed ? `, ${scheduled.failed} failed` : ''}. <Link to="/scheduled">View</Link>
            </p>
          ) : null}
        </Section>
      </div>

      <div className="ig-two-col mb-24">
        <Section title="📣 Instagram overview" right={<Link to="/instagram-insights" className="btn btn-ghost btn-sm">Insights</Link>}>
          {setup.instagramAccounts === 0 ? (
            <p className="form-helper">No Instagram account connected. <Link to="/instagram">Connect one</Link> to post products and AI quote images automatically.</p>
          ) : (
            <>
              <div className="kpi-section-title">Posts by source</div>
              <BarList rows={igMix} total={igTotal} label="Posts by source" empty="Nothing published yet." />
              <div className="kpi-section-title" style={{ marginTop: 18 }}>Comments</div>
              <div className="flex gap-12" style={{ flexWrap: 'wrap', fontSize: 13 }}>
                <span className="badge badge-warning">{instagram.comments_waiting} waiting for reply</span>
                <span className="badge badge-danger">{instagram.comments_flagged} flagged</span>
                <span className="badge badge-success">{instagram.replies_30d} replied (30d)</span>
              </div>
              {instagram.topPosts.length > 0 && (
                <>
                  <div className="kpi-section-title" style={{ marginTop: 18 }}>Top Studio posts by likes</div>
                  <BarList rows={instagram.topPosts.map((p) => ({ key: p.id, label: p.headline, value: p.likes || 0 }))} label="Top posts" />
                </>
              )}
              {instagram.studio_ready > 0 && (
                <p className="form-helper" style={{ marginTop: 12 }}>
                  {instagram.studio_ready} Studio post{instagram.studio_ready === 1 ? '' : 's'} passed the quality check and {instagram.studio_ready === 1 ? 'is' : 'are'} ready to publish. <Link to="/instagram-studio">Open Studio</Link>
                </p>
              )}
            </>
          )}
        </Section>

        <Section title="🕒 Recent activity">
          {activity.length === 0 ? <p className="form-helper">Nothing yet.</p> : activity.map((a, i) => {
            const [label, badge] = ACTIVITY_LABEL[a.kind] || [a.kind, 'badge-info'];
            return (
              <div key={i} className="ig-list-row" style={{ padding: '8px 0' }}>
                <div className="flex items-center justify-between gap-12" style={{ flexWrap: 'wrap' }}>
                  <span className="flex items-center gap-8" style={{ minWidth: 0 }}>
                    {a.area === 'instagram' ? <Instagram size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} /> : <FileText size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
                    <span className={`badge ${badge}`}>{label}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }} title={a.title || ''}>
                  {a.title || '—'}{a.who ? <span style={{ color: 'var(--text-muted)' }}> · {a.who}</span> : null}
                </div>
              </div>
            );
          })}
        </Section>
      </div>

      {/* Quick actions */}
      <Section title="⚡ Quick actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            [PenLine, 'Write an article', 'SEO blog post with AI', '/generate', setup.dnaReady],
            [Rocket, 'Blog campaign', 'Auto-write a category series', '/campaigns', setup.dnaReady],
            [Sparkles, 'Instagram Studio', 'AI quote posts with a quality check', '/instagram-studio', setup.instagramAccounts > 0],
            [CalendarClock, 'Product Scheduler', 'Post products daily', '/instagram-scheduler', setup.instagramAccounts > 0],
            [MessageCircle, 'Comments', 'Review AI-drafted replies', '/instagram-comments', setup.instagramAccounts > 0],
            [Dna, 'Business DNA', 'Refresh store knowledge', '/business-dna', setup.storeConnected],
          ].map(([Icon, title, desc, to, enabled]) => (
            <button key={to} type="button" onClick={() => navigate(to)} className="flex gap-12"
              style={{ textAlign: 'left', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-secondary)', background: 'var(--bg-secondary)', color: 'inherit', cursor: 'pointer', opacity: enabled ? 1 : 0.55, alignItems: 'flex-start' }}>
              <Icon size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{title} <ExternalLink size={11} style={{ opacity: 0.5 }} /></span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
