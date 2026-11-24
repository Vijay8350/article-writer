import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Dna, PenLine, Instagram, Sparkles, MessageCircle, Rocket, CalendarClock, RefreshCw,
  CheckCircle2, Circle, ChevronRight, FileText, Send, BadgeCheck, Workflow, LayoutDashboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getDashboard } from '../lib/api';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';
import { PageHeader, Section, EmptyState } from '../components/ui';
import '../styles/workspace.css';

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

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={18} aria-hidden="true" /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="dash-stat__sub">{sub}</div>}
    </div>
  );
}

// Plan meter: used vs limit, coloured by how close to the limit.
function Meter({ label, used, limit, to }) {
  const p = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = p >= 100 ? 'is-full' : p >= 80 ? 'is-warn' : '';
  return (
    <div className="wk-meter">
      <div className="wk-meter__head">
        <Link to={to}>{label}</Link>
        <strong>{used} / {limit}</strong>
      </div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}>
        <div className={tone} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function SetupItem({ ok, title, meta, to, cta, optional = false }) {
  return (
    <li className="list-item">
      <span className={`list-item__media${ok ? ' is-done' : ''}`}>
        {ok ? <CheckCircle2 size={18} aria-label="Done" /> : <Circle size={18} aria-label="To do" />}
      </span>
      <div className="list-item__main">
        <div className="list-item__title">
          {title}
          {optional && !ok && <span className="badge badge-purple">Optional</span>}
        </div>
        {meta && <div className="list-item__meta"><span className="wk-truncate">{meta}</span></div>}
      </div>
      <div className="list-item__actions">
        {ok ? <span className="status status--on">Done</span> : <Link to={to} className="btn btn-secondary btn-sm">{cta}</Link>}
      </div>
    </li>
  );
}

// Keeps an empty chart card the same height as a full one.
function ChartEmpty({ children }) {
  return <div className="dash-empty"><p>{children}</p></div>;
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

  const refreshButton = (
    <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
      <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh
    </button>
  );

  if (loading && !data) {
    return <div className="page-container fade-in"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }
  if (!data) {
    return (
      <div className="page-container fade-in">
        <PageHeader title="Dashboard" subtitle="What your workspace made in the last 30 days: blog articles and Instagram posts." />
        <Section>
          <EmptyState
            icon={LayoutDashboard}
            title="Nothing to show"
            text="The dashboard couldn't be loaded. Check your connection and try again."
            action={<button className="btn btn-primary" onClick={load}><RefreshCw size={16} /> Try again</button>}
          />
        </Section>
      </div>
    );
  }

  const { setup, usage, articles, instagram, activity } = data;
  const setupDone = setup.storeConnected && setup.dnaReady;
  const setupCount = [setup.storeConnected, setup.dnaReady, setup.instagramAccounts > 0].filter(Boolean).length;
  const articleDaily = articles.daily.map((d) => ({ key: d.day, label: shortDate(d.day), title: shortDate(d.day), value: d.generated, extra: d.published ? `${d.published} published` : null }));
  const igDaily = instagram.daily.map((d) => ({ key: d.day, label: shortDate(d.day), title: shortDate(d.day), value: d.published, extra: d.failed ? `${d.failed} failed` : null }));
  const monthly = articles.byMonth.map((m) => ({ key: m.period, label: monthLabel(m.period), title: monthLabel(m.period), value: m.articles, extra: m.ig_posts ? `${m.ig_posts} Instagram posts` : null }));
  const igTotal = instagram.product_posts + instagram.studio_posts;
  const campaignArticles = Object.fromEntries(articles.campaigns.articles.map((r) => [r.status, r.n]));
  const scheduled = Object.fromEntries(articles.scheduled.map((r) => [r.status, r.n]));
  const activeCampaigns = articles.campaigns.campaigns.find((c) => c.status === 'active')?.n || 0;
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
      <PageHeader
        title="Dashboard"
        subtitle="What your workspace made in the last 30 days: blog articles and Instagram posts."
        actions={refreshButton}
      />

      <div className="stack">
        {/* Headline numbers: 3 across (two even rows), 6 across on wide screens */}
        <div className="stat-row dash-kpis">
          <Stat icon={PenLine} label="Articles written (30 days)" value={compact(articles.generated_30d)} sub={`${compact(articles.generated)} all time`} />
          <Stat icon={Send} label="Articles published (30 days)" value={compact(articles.published_30d)} sub={`${compact(articles.drafts)} drafts all time`} />
          <Stat icon={Instagram} label="Instagram posts" value={compact(igTotal)} sub={`${compact(sumBy(instagram.daily, 'published'))} in the last 30 days`} />
          <Stat icon={BadgeCheck} label="Image quality pass rate" value={q.checked ? pct(q.passed, q.checked) : '—'} sub={q.checked ? `${q.checked} images checked · average score ${q.avg_score}` : 'No Studio images yet'} />
          <Stat icon={MessageCircle} label="Comment replies (30 days)" value={compact(instagram.replies_30d)} sub={instagram.comments_waiting ? `${instagram.comments_waiting} waiting for you` : 'Nothing waiting'} />
          <Stat icon={Workflow} label="Active automations" value={compact(instagram.active_jobs + activeCampaigns)} sub={`${instagram.active_jobs} Instagram jobs · ${activeCampaigns} blog campaigns`} />
        </div>

        {/* Setup: only until the store and Business DNA are ready */}
        {!setupDone && (
          <Section
            flush
            className="dash-setup"
            title="Get set up"
            description="Finish these steps so articles can link to your real products."
            actions={<span className="badge badge-purple">{setupCount} of 3 done</span>}
          >
            <ul className="list">
              <SetupItem
                ok={setup.storeConnected}
                title={setup.storeConnected ? 'Shopify store connected' : 'Connect your Shopify store'}
                meta={setup.storeConnected ? setup.storeUrl : 'Needed to read your products and publish to your blog.'}
                to="/settings"
                cta="Connect store"
              />
              <SetupItem
                ok={setup.dnaReady}
                title={setup.dnaReady ? 'Business DNA ready' : 'Build your Business DNA'}
                meta={setup.dnaReady ? `${setup.dnaProducts} products, ${setup.dnaArticles} articles` : 'Teaches the AI your products so articles link to them.'}
                to="/business-dna"
                cta="Build DNA"
              />
              <SetupItem
                ok={setup.instagramAccounts > 0}
                optional
                title={setup.instagramAccounts > 0 ? `${setup.instagramAccounts} Instagram account${setup.instagramAccounts === 1 ? '' : 's'} connected` : 'Connect an Instagram account'}
                meta={setup.instagramAccounts > 0 ? null : 'For daily product posts and AI quote posts.'}
                to="/instagram"
                cta="Connect Instagram"
              />
            </ul>
          </Section>
        )}

        <div className="two-col-even">
          <Section title="Articles written per day" description="Last 30 days">
            {sumBy(articles.daily, 'generated') === 0
              ? <ChartEmpty>No articles in the last 30 days. <Link to="/generate">Write one</Link> or start a <Link to="/campaigns">campaign</Link>.</ChartEmpty>
              : <ColumnChart data={articleDaily} label="Day" valueLabel="Articles written" />}
          </Section>
          <Section title="Instagram posts per day" description="Last 30 days">
            {sumBy(instagram.daily, 'published') === 0 && sumBy(instagram.daily, 'failed') === 0
              ? <ChartEmpty>No Instagram posts yet. Add a job in the <Link to="/instagram-scheduler">Product Scheduler</Link> or make one in the <Link to="/instagram-studio">Studio</Link>.</ChartEmpty>
              : <ColumnChart data={igDaily} label="Day" valueLabel="Posts published" />}
          </Section>
        </div>

        <div className="two-col-even">
          <Section
            title="Monthly output"
            description={`${usage.planName} plan`}
            actions={<Link to="/plan" className="btn btn-ghost btn-sm">Plan &amp; usage <ChevronRight size={14} /></Link>}
          >
            <Meter label="Articles this month" used={usage.used} limit={usage.limit} to="/plan" />
            <Meter label="Instagram Studio posts this month" used={usage.igUsed} limit={usage.igLimit} to="/plan" />
            <div className="dash-subhead">
              <div className="kpi-section-title">Articles by month</div>
              {sumBy(articles.byMonth, 'articles') === 0
                ? <p className="form-helper">No articles in the last 6 months.</p>
                : <ColumnChart data={monthly} height={140} label="Month" valueLabel="Articles" />}
            </div>
          </Section>

          <Section title="Quality and outcomes">
            <div className="kpi-section-title">Instagram Studio quality check</div>
            {q.checked ? (
              <div className="kpi-grid dash-mini-kpis">
                <Kpi label="Passed" value={pct(q.passed, q.checked)} sub={`${q.passed} of ${q.checked}`} />
                <Kpi label="Average score" value={q.avg_score ?? '—'} sub="out of 100" />
                <Kpi label="Average attempts" value={q.avg_attempts ?? '—'} sub="images per post" />
              </div>
            ) : <p className="form-helper mb-16">No images checked yet.</p>}
            <div className="kpi-section-title">Blog campaign articles</div>
            <BarList rows={campaignRows} total={campaignRows.reduce((s, r) => s + r.value, 0)} label="Campaign article outcomes" empty="No campaign articles yet." />
            {(scheduled.pending || scheduled.failed) ? (
              <p className="form-helper dash-foot-note">
                Scheduled posts: {scheduled.pending || 0} pending{scheduled.failed ? `, ${scheduled.failed} failed` : ''}. <Link to="/scheduled">View</Link>
              </p>
            ) : null}
          </Section>
        </div>

        <div className="two-col-even">
          <Section
            title="Instagram overview"
            actions={<Link to="/instagram-insights" className="btn btn-ghost btn-sm">Insights <ChevronRight size={14} /></Link>}
          >
            {setup.instagramAccounts === 0 ? (
              <ChartEmpty>No Instagram account connected. <Link to="/instagram">Connect one</Link> to post products and AI quote images automatically.</ChartEmpty>
            ) : (
              <>
                <div className="kpi-section-title">Posts by source</div>
                <BarList rows={igMix} total={igTotal} label="Posts by source" empty="Nothing published yet." />
                <div className="kpi-section-title dash-subhead">Comments</div>
                <div className="dash-badges">
                  <span className={`badge ${instagram.comments_waiting ? 'badge-warning' : 'badge-purple'}`}>{instagram.comments_waiting} waiting for reply</span>
                  <span className={`badge ${instagram.comments_flagged ? 'badge-danger' : 'badge-purple'}`}>{instagram.comments_flagged} flagged</span>
                  <span className="badge badge-success">{instagram.replies_30d} replied (30 days)</span>
                </div>
                {instagram.topPosts.length > 0 && (
                  <>
                    <div className="kpi-section-title dash-subhead">Top Studio posts by likes</div>
                    <BarList rows={instagram.topPosts.map((p) => ({ key: p.id, label: p.headline, value: p.likes || 0 }))} label="Top posts" />
                  </>
                )}
                {instagram.studio_ready > 0 && (
                  <p className="form-helper dash-foot-note">
                    {instagram.studio_ready} Studio post{instagram.studio_ready === 1 ? '' : 's'} passed the quality check and {instagram.studio_ready === 1 ? 'is' : 'are'} ready to publish. <Link to="/instagram-studio">Open Studio</Link>
                  </p>
                )}
              </>
            )}
          </Section>

          <Section title="Recent activity" flush className="dash-activity">
            {activity.length === 0 ? (
              <ChartEmpty>Nothing yet. Articles and posts show up here as they happen.</ChartEmpty>
            ) : (
              <ul className="list">
                {activity.map((a, i) => {
                  const [label, badge] = ACTIVITY_LABEL[a.kind] || [a.kind, 'badge-info'];
                  const AreaIcon = a.area === 'instagram' ? Instagram : FileText;
                  return (
                    <li key={i} className="list-item">
                      <span className="list-item__media"><AreaIcon size={15} aria-label={a.area === 'instagram' ? 'Instagram' : 'Blog'} /></span>
                      <div className="list-item__main">
                        <div className="list-item__title"><span className="wk-truncate" title={a.title || ''}>{a.title || '—'}</span></div>
                        <div className="list-item__meta">
                          <span className={`badge ${badge}`}>{label}</span>
                          {a.who && <span>{a.who}</span>}
                          <span title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Quick actions">
          <div className="dash-actions">
            {[
              [PenLine, 'Write an article', 'SEO blog post with AI', '/generate', setup.dnaReady],
              [Rocket, 'Blog campaign', 'Auto-write a category series', '/campaigns', setup.dnaReady],
              [Sparkles, 'Instagram Studio', 'AI quote posts with a quality check', '/instagram-studio', setup.instagramAccounts > 0],
              [CalendarClock, 'Product Scheduler', 'Post products daily', '/instagram-scheduler', setup.instagramAccounts > 0],
              [MessageCircle, 'Comments', 'Review AI-drafted replies', '/instagram-comments', setup.instagramAccounts > 0],
              [Dna, 'Business DNA', 'Refresh store knowledge', '/business-dna', setup.storeConnected],
            ].map(([Icon, title, desc, to, enabled]) => (
              <button key={to} type="button" onClick={() => navigate(to)} className={`dash-action${enabled ? '' : ' is-dim'}`}>
                <Icon size={20} className="dash-action__icon" aria-hidden="true" />
                <span className="dash-action__text">
                  <span className="dash-action__title">{title}</span>
                  <span className="dash-action__desc">{desc}</span>
                </span>
                <ChevronRight size={16} className="dash-action__go" aria-hidden="true" />
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
