import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, RefreshCw, Loader2, MessageCircle, AlertTriangle, Info, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { getInstagramAccounts, getIgInsights } from '../lib/api';
import { PageHeader, Section, Segmented, EmptyState } from '../components/ui';
import { errMsg, fmt } from '../components/studio/shared';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';
import '../styles/ig-studio.css';

const PERIODS = [7, 14, 30];
const TYPE_LABELS = { POST: 'Posts', REEL: 'Reels', STORY: 'Stories', AD: 'Ads', CAROUSEL_CONTAINER: 'Carousels', IGTV: 'IGTV' };
const GENDER_LABELS = { F: 'Women', M: 'Men', U: 'Not specified' };
const POST_COLUMNS = [['views', 'Views'], ['reach', 'Reach'], ['likes', 'Likes'], ['comments', 'Comments'], ['saves', 'Saves'], ['shares', 'Shares'], ['rate', 'Eng. rate']];

const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(undefined, { type: 'region' });
    return (code) => { try { return names.of(code) || code; } catch { return code; } };
  } catch { return (code) => code; }
})();
const shortDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const percent = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const sum = (rows) => (rows || []).reduce((s, r) => s + r.value, 0);

// The API re-indexes Meta's online-follower hours to UTC; show them in the
// browser's time zone, midnight first (half-hour zones like IST start at :30).
function localHours(utc) {
  const offset = -new Date().getTimezoneOffset();
  const time = (min, withMinutes) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60)
    .toLocaleTimeString([], { hour: 'numeric', ...(withMinutes ? { minute: '2-digit' } : {}) });
  return utc.map((value, h) => {
    const start = (((h * 60 + offset) % 1440) + 1440) % 1440;
    return { key: h, start, value, label: time(start, start % 60 !== 0), title: `${time(start, true)} – ${time((start + 60) % 1440, true)}` };
  }).sort((a, b) => a.start - b.start);
}

function PostsTable({ posts }) {
  const [sort, setSort] = useState({ key: 'timestamp', dir: -1 });
  const rows = useMemo(() => posts
    .map((p) => ({ ...p, rate: p.reach ? p.interactions / p.reach : null }))
    .sort((a, b) => {
      const av = sort.key === 'timestamp' ? Date.parse(a.timestamp) : a[sort.key] ?? -1;
      const bv = sort.key === 'timestamp' ? Date.parse(b.timestamp) : b[sort.key] ?? -1;
      return (av - bv) * sort.dir;
    }), [posts, sort]);
  const header = (key, label, num = true) => (
    <th className={`sortable ${num ? 'num' : ''}`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="ig-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  return (
    <div className="table-container">
      <table className="data-table insights-table">
        <thead>
          <tr>
            <th>Post</th>
            {header('timestamp', 'Date', false)}
            {POST_COLUMNS.map(([k, l]) => <React.Fragment key={k}>{header(k, l)}</React.Fragment>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="ig-post-td">
                <a href={p.permalink || '#'} target="_blank" rel="noreferrer" className="ig-post-cell">
                  {p.imageUrl
                    ? <img className="ig-thumb" src={p.imageUrl} alt="" width="44" height="44" loading="lazy" />
                    : <span className="ig-thumb" />}
                  <span className="ig-post-cell__text">
                    <span className="badge badge-purple">{p.kind}</span>
                    {p.caption ? `${p.caption.slice(0, 70)}${p.caption.length > 70 ? '…' : ''}` : 'No caption'}
                  </span>
                </a>
              </td>
              <td>{p.timestamp ? new Date(p.timestamp).toLocaleDateString() : '—'}</td>
              {POST_COLUMNS.map(([k]) => (
                <td key={k} className="num">{k === 'rate' ? (p.rate == null ? '—' : `${(p.rate * 100).toFixed(1)}%`) : compact(p[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InstagramInsights() {
  const [accounts, setAccounts] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    getInstagramAccounts()
      .then((r) => { const list = r.data || []; setAccounts(list); setAccountId(list[0]?.id || ''); }) // default account is listed first
      .catch((err) => { toast.error(errMsg(err)); setAccounts([]); });
  }, []);

  const load = useCallback(async (fresh = false) => {
    if (!accountId) return;
    const id = ++request.current; // ignore a slower answer for a previous account/period
    setLoading(true);
    setError(null);
    try {
      const r = await getIgInsights(accountId, days, fresh);
      if (id === request.current) setData(r.data);
    } catch (err) {
      if (id === request.current) setError(errMsg(err, 'Could not load insights'));
    }
    if (id === request.current) setLoading(false);
  }, [accountId, days]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals || {};
  const p = data?.profile;
  const hours = data?.onlineHoursUtc ? localHours(data.onlineHoursUtc) : null;
  const peakIndex = hours ? hours.reduce((best, h, i) => (h.value > hours[best].value ? i : best), 0) : null;
  const newFollowers = data?.daily?.newFollowers || [];
  const ages = data?.audience?.ages ? [...data.audience.ages].sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10)) : null;

  return (
    <div className="page-container fade-in ig-page">
      <PageHeader title="Instagram Insights" subtitle="Reach, engagement, followers, audience and every recent post, live from Instagram." />

      {accounts === null ? <div className="empty-state"><div className="spinner spinner-lg" /></div> : accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BarChart3}
            title="Connect an Instagram account first"
            text="Insights are read live from a connected Instagram account."
            action={<Link to="/instagram" className="btn btn-primary">Go to Instagram accounts</Link>}
          />
        </div>
      ) : (
        <>
          <div className="toolbar">
            <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Instagram account">
              {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}{a.is_default ? ' (default)' : ''}</option>)}
            </select>
            <Segmented value={days} onChange={setDays} ariaLabel="Period" options={PERIODS.map((d) => ({ value: d, label: `Last ${d} days` }))} />
            <div className="toolbar__spacer" />
            {data && <span className="ig-updated">Updated {fmt(data.fetchedAt)}</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={loading}>
              {loading ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>

          {error && (
            <div className="callout callout--danger mb-24" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <strong>{error}</strong>
                <p>Check the connection on <Link to="/instagram">Instagram accounts</Link> (Details → API connection → Read insights).</p>
              </div>
            </div>
          )}
          {!data && loading && <div className="empty-state"><div className="spinner spinner-lg" /><p>Loading from Instagram…</p></div>}

          {data && (
            <div className={`stack ${loading ? 'refetching' : ''}`}>
              {p && (
                <section className="card">
                  <div className="card-body ig-profile">
                    {p.profilePictureUrl && (
                      <img className="ig-profile__pic" src={p.profilePictureUrl} alt="" width="64" height="64"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <div className="ig-profile__main">
                      <span className="ig-profile__name">{p.name || `@${p.username}`}</span>
                      <a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noreferrer">@{p.username}</a>
                      {p.biography && <p className="ig-profile__bio">{p.biography}</p>}
                    </div>
                    <div className="ig-profile__stats">
                      {[['Followers', p.followersCount], ['Following', p.followsCount], ['Posts', p.mediaCount]].map(([label, v]) => (
                        <div key={label}><div className="kpi-value">{compact(v)}</div><div className="kpi-label">{label}</div></div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              <Section title={`Last ${data.days} days`} description="Totals for the whole period.">
                <div className="ig-chart-group">
                  <div className="kpi-section-title">Reach &amp; visibility</div>
                  <div className="kpi-grid">
                    <Kpi label="Views" value={compact(t.views)} hint="Times your content was played or displayed" />
                    <Kpi label="Accounts reached" value={compact(t.reach)} hint="Unique accounts that saw your content" />
                    <Kpi label="Profile visits" value={compact(t.profile_views)} />
                    <Kpi label="Link taps" value={compact(t.profile_links_taps)} hint="Taps on links and contact buttons on your profile" />
                    <Kpi label="Website clicks" value={compact(t.website_clicks)} />
                  </div>
                </div>
                <div className="ig-chart-group">
                  <div className="kpi-section-title">Engagement</div>
                  <div className="kpi-grid">
                    <Kpi label="Interactions" value={compact(t.total_interactions)} hint="Likes, comments, saves, shares and replies" />
                    <Kpi label="Engagement rate" value={percent(t.total_interactions, t.reach)} sub="interactions ÷ accounts reached" />
                    <Kpi label="Accounts engaged" value={compact(t.accounts_engaged)} />
                    <Kpi label="Likes" value={compact(t.likes)} />
                    <Kpi label="Comments" value={compact(t.comments)} sub={<Link to="/instagram-comments">Open comments →</Link>} />
                    <Kpi label="Saves (net)" value={compact(t.saves)} hint="Saves minus unsaves, so it can be negative" />
                    <Kpi label="Shares" value={compact(t.shares)} />
                    <Kpi label="Story replies" value={compact(t.replies)} />
                  </div>
                </div>
                <div className="ig-chart-group">
                  <div className="kpi-section-title">Followers</div>
                  <div className="kpi-grid">
                    <Kpi label="New follows" value={data.follows ? compact(data.follows.follows) : '—'} />
                    <Kpi label="Unfollows" value={data.follows ? compact(data.follows.unfollows) : '—'} />
                    <Kpi label="Net change" value={data.follows ? `${data.follows.follows - data.follows.unfollows > 0 ? '+' : ''}${compact(data.follows.follows - data.follows.unfollows)}` : '—'} />
                  </div>
                </div>
              </Section>

              <div className="grid-2">
                <Section title="Daily reach" description="Accounts that saw your content each day.">
                  {data.daily.reach?.length
                    ? <ColumnChart label="Day" valueLabel="Accounts reached" data={data.daily.reach.map((d) => ({ key: d.date, label: shortDate(d.date), value: d.value }))} />
                    : <p className="form-helper">Not available for this account yet.</p>}
                </Section>
                <Section title="New followers per day" description="Follows gained each day.">
                  {newFollowers.length && sum(newFollowers) > 0
                    ? <ColumnChart label="Day" valueLabel="New followers" data={newFollowers.map((d) => ({ key: d.date, label: shortDate(d.date), value: d.value }))} />
                    : <p className="form-helper">No new followers in this period{newFollowers.length ? '' : ' (Instagram shows this from 100 followers)'}.</p>}
                </Section>
              </div>

              <div className="grid-2">
                <Section title="Best time to post" description="When your followers are online, in your time zone.">
                  {hours ? (
                    <>
                      <p className="ig-peak">
                        Most of your followers are online around <strong>{hours[peakIndex].title.split(' – ')[0]}</strong>.
                      </p>
                      <ColumnChart label="Hour" valueLabel="Followers online" highlight={peakIndex} data={hours} height={160} />
                    </>
                  ) : <p className="form-helper">Instagram hasn't shared follower activity for this account yet.</p>}
                </Section>
                <Section title="Reach by content type" description="Accounts reached by each format.">
                  <BarList label="Reach by content type" total={sum(data.reachByType)}
                    rows={(data.reachByType || []).map((r) => ({ key: r.key, label: TYPE_LABELS[r.key] || r.key, value: r.value }))} />
                </Section>
              </div>

              <Section title="Audience" description="Where your followers live, and their age and gender.">
                <div className="grid-2">
                  <div>
                    <div className="kpi-section-title">Top countries</div>
                    <BarList label="Top countries" total={sum(data.audience.countries)}
                      rows={(data.audience.countries || []).map((r) => ({ key: r.key, label: regionName(r.key), value: r.value }))} />
                  </div>
                  <div>
                    <div className="kpi-section-title">Top cities</div>
                    <BarList label="Top cities" total={sum(data.audience.cities)} rows={(data.audience.cities || []).map((r) => ({ key: r.key, label: r.key, value: r.value }))} />
                  </div>
                  <div>
                    <div className="kpi-section-title">Age</div>
                    <BarList label="Age" total={sum(ages)} limit={10} rows={(ages || []).map((r) => ({ key: r.key, label: r.key, value: r.value }))} />
                  </div>
                  <div>
                    <div className="kpi-section-title">Gender</div>
                    <BarList label="Gender" total={sum(data.audience.genders)}
                      rows={(data.audience.genders || []).map((r) => ({ key: r.key, label: GENDER_LABELS[r.key] || r.key, value: r.value }))} />
                  </div>
                </div>
              </Section>

              <Section
                flush
                title={`Recent posts (${data.posts.length})`}
                description="Lifetime numbers per post. Click a column to sort, or a post to open it on Instagram."
                actions={<Link to="/instagram-comments" className="btn btn-ghost btn-sm"><MessageCircle size={14} /> Comments</Link>}
              >
                {data.posts.length
                  ? <PostsTable posts={data.posts} />
                  : <EmptyState icon={ImageIcon} title="No posts yet" text="Posts on this account appear here with their numbers." />}
              </Section>

              {data.notes?.length > 0 && (
                <div className="callout ig-notes">
                  <Info size={16} aria-hidden="true" />
                  <div>{data.notes.map((n) => <p key={n}>{n}</p>)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
