import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Lock, LayoutDashboard, Dna, PenLine, FileText, CalendarClock, Rocket, Gauge, Shield, Settings, LogOut, Users, Building2, Instagram, AlarmClock, MessageCircle, Sparkles, Megaphone, BarChart3, ImagePlus, SearchCheck } from 'lucide-react';
import { getSettings, getUsage, adminGetUsers, adminGetUpgradeRequests } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Items without a `path` are planned features, shown greyed out with a "Soon" tag.
const navSections = [
  {
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/business-dna', icon: Dna, label: 'Business DNA' },
    ],
  },
  {
    title: 'Blog',
    items: [
      { path: '/generate', icon: PenLine, label: 'Generate Article', feature: 'articles' },
      { path: '/campaigns', icon: Rocket, label: 'Campaigns', feature: 'campaigns' },
      { path: '/articles', icon: FileText, label: 'Existing Articles', feature: 'articles' },
      { path: '/scheduled', icon: CalendarClock, label: 'Scheduled Posts', feature: 'scheduled_posts' },
    ],
  },
  {
    title: 'SEO',
    items: [
      { path: '/seo', icon: SearchCheck, label: 'SEO Automation', feature: 'seo' },
    ],
  },
  {
    title: 'Instagram',
    items: [
      { path: '/instagram', icon: Instagram, label: 'Accounts' },
      { path: '/instagram-insights', icon: BarChart3, label: 'Insights', feature: 'insights' },
      { path: '/instagram-studio', icon: Sparkles, label: 'Studio', feature: 'studio' },
      { path: '/instagram-campaigns', icon: Megaphone, label: 'Campaigns', feature: 'studio' },
      { path: '/instagram-comments', icon: MessageCircle, label: 'Comments', feature: 'comments' },
      { path: '/instagram-product-images', icon: ImagePlus, label: 'AI Product Posts', feature: 'product_posts' },
      { path: '/instagram-scheduler', icon: AlarmClock, label: 'Product Scheduler', feature: 'product_posts' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { path: '/plan', icon: Gauge, label: 'Plan & Usage' },
      { path: '/members', icon: Users, label: 'Members' },
      { path: '/workspaces', icon: Building2, label: 'Workspaces' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export default function Layout() {
  const { user, logout, workspaces, activeWorkspaceId, activeRole, switchWorkspace } = useAuth();
  const [connected, setConnected] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [waiting, setWaiting] = useState({ users: 0, upgrades: 0 });
  const [features, setFeatures] = useState({}); // what the workspace's plan includes (missing = included)
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Sign-ups and upgrade requests waiting for an admin, shown on the Admin link.
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([adminGetUsers(), adminGetUpgradeRequests()])
      .then(([u, r]) => setWaiting({ users: (u.data || []).filter(x => x.status === 'pending').length, upgrades: (r.data || []).length }))
      .catch(() => {});
  }, [isAdmin, pathname]);

  // The plan decides which features this workspace has; the rest show a lock.
  useEffect(() => {
    if (!activeWorkspaceId) { setFeatures({}); return; }
    getUsage().then((res) => setFeatures(res.data?.features || {})).catch(() => setFeatures({}));
  }, [activeWorkspaceId, pathname === '/plan']);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    getSettings()
      .then(res => {
        setConnected(res.data?.connected || false);
        setStoreName(res.data?.storeUrl || '');
      })
      .catch(() => {});
  }, [activeWorkspaceId]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src="/favicon.svg" alt="" width="24" height="24" />
            Article Writer
          </h1>
          <p>Shopify Blog Engine</p>
        </div>

        {workspaces.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Workspace</div>
            <select
              className="form-select"
              style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
              value={activeWorkspaceId || ''}
              onChange={e => switchWorkspace(e.target.value)}
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
              ))}
            </select>
            {activeRole && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>You are <strong>{activeRole}</strong></div>
            )}
          </div>
        )}

        <nav className="sidebar-nav">
          {navSections.map((section, i) => (
            <React.Fragment key={section.title || i}>
              {section.title && <div className="nav-section-title">{section.title}</div>}
              {section.items.map(item => (item.path && item.feature && features[item.feature] === false ? (
                <Link key={item.path} to={`/plan?locked=${item.feature}`} className="nav-item nav-item-locked" title="Not included in your plan — see Plan & Usage">
                  <item.icon />
                  {item.label}
                  <Lock size={13} style={{ marginLeft: 'auto', opacity: 0.7 }} aria-label="not in your plan" />
                </Link>
              ) : item.path ? (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/dashboard'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <item.icon />
                  {item.label}
                </NavLink>
              ) : (
                <div key={item.label} className="nav-item nav-item-soon" title={item.hint}>
                  <item.icon />
                  {item.label}
                  <span className="nav-soon">Soon</span>
                </div>
              )))}
            </React.Fragment>
          ))}
          {isAdmin && (
            <NavLink
              to={waiting.users ? '/admin?tab=pending' : waiting.upgrades ? '/admin?tab=upgrades' : '/admin'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Shield />
              Admin
              {waiting.users + waiting.upgrades > 0 && (
                <span className="nav-soon" style={{ background: 'var(--accent-warning)', color: '#111' }} title="Sign-ups and upgrade requests waiting for you">
                  {waiting.users + waiting.upgrades}
                </span>
              )}
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-badge">
            <span className={`connection-dot ${connected ? 'connected' : ''}`} />
            {connected ? (
              <span style={{ color: 'var(--accent-success)' }}>
                {storeName ? storeName.split('.')[0] : 'Connected'}
              </span>
            ) : (
              <span>Not Connected</span>
            )}
          </div>
          {user && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Signed in as
              </div>
              <Link
                to="/account"
                title="Account & security"
                style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10, textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)' }}
              >
                {user.email}
              </Link>
              <button className="btn btn-secondary w-full" onClick={logout} title="Log out">
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <Outlet context={{ connected, setConnected, storeName, setStoreName }} />
      </main>
    </div>
  );
}
