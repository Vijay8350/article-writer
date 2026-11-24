import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  Lock, LayoutDashboard, Dna, PenLine, FileText, CalendarClock, Rocket, Gauge, Shield, Settings, LogOut, Users,
  Building2, Instagram, AlarmClock, MessageCircle, Sparkles, Megaphone, BarChart3, ImagePlus, SearchCheck,
  ChevronsUpDown, Menu, X, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { getSettings, getUsage, adminGetUsers, adminGetUpgradeRequests } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitch, ThemeToggle } from './ThemeSwitch';

// The app menu. `feature` ties an item to a plan feature: when the workspace's plan
// doesn't include it, the item shows a lock and leads to Plan & usage instead.
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
      { path: '/generate', icon: PenLine, label: 'Generate article', feature: 'articles' },
      { path: '/articles', icon: FileText, label: 'Articles', feature: 'articles' },
      { path: '/campaigns', icon: Rocket, label: 'Campaigns', feature: 'campaigns' },
      { path: '/scheduled', icon: CalendarClock, label: 'Scheduled posts', feature: 'scheduled_posts' },
    ],
  },
  {
    title: 'SEO',
    items: [
      { path: '/seo', icon: SearchCheck, label: 'SEO automation', feature: 'seo' },
    ],
  },
  {
    title: 'Instagram',
    items: [
      { path: '/instagram-product-images', icon: ImagePlus, label: 'AI product posts', feature: 'product_posts' },
      { path: '/instagram-scheduler', icon: AlarmClock, label: 'Product scheduler', feature: 'product_posts' },
      { path: '/instagram-studio', icon: Sparkles, label: 'Studio', feature: 'studio' },
      { path: '/instagram-campaigns', icon: Megaphone, label: 'Campaigns', feature: 'studio' },
      { path: '/instagram-comments', icon: MessageCircle, label: 'Comments', feature: 'comments' },
      { path: '/instagram-insights', icon: BarChart3, label: 'Insights', feature: 'insights' },
      { path: '/instagram', icon: Instagram, label: 'Accounts' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { path: '/plan', icon: Gauge, label: 'Plan & usage' },
      { path: '/members', icon: Users, label: 'Members' },
      { path: '/workspaces', icon: Building2, label: 'Workspaces' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

function Brand() {
  return (
    <Link to="/dashboard" className="sidebar-logo" aria-label="Article Writer — dashboard">
      <img src="/favicon.svg" alt="" width="28" height="28" />
      <strong>Article Writer</strong>
    </Link>
  );
}

export default function Layout() {
  const { user, logout, workspaces, activeWorkspaceId, activeRole, switchWorkspace } = useAuth();
  const [connected, setConnected] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [waiting, setWaiting] = useState({ users: 0, upgrades: 0 });
  const [features, setFeatures] = useState({}); // what the workspace's plan includes (missing = included)
  const [menuOpen, setMenuOpen] = useState(false); // phones: the sidebar slides in
  // desktop: the sidebar can shrink to icons; remembered in this browser
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('aw_sidebar') === 'collapsed'; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((v) => {
    try { localStorage.setItem('aw_sidebar', v ? 'open' : 'collapsed'); } catch { /* ignore */ }
    return !v;
  });
  const tip = (label) => (collapsed ? label : undefined);
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

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

  // Close the phone menu after moving to another page; Escape closes it too.
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const waitingCount = waiting.users + waiting.upgrades;

  return (
    <div className={`app-layout ${collapsed ? 'is-collapsed' : ''}`}>
      <div className={`sidebar-scrim ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Main menu">
        <div className="sidebar-head">
          <Brand />
          <button
            type="button"
            className="sidebar-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {workspaces.length > 0 && (
          <div className="ws-switch">
            <div className="ws-switch__box" title={tip(activeWs?.name)}>
              <span className="ws-switch__avatar" aria-hidden="true">{(activeWs?.name || '?').trim().charAt(0)}</span>
              <span className="ws-switch__text">
                <span className="ws-switch__name" style={{ display: 'block' }}>{activeWs?.name || 'Choose a workspace'}</span>
                {activeRole && <span className="ws-switch__role">{activeRole}</span>}
              </span>
              {workspaces.length > 1 && <ChevronsUpDown size={15} className="ws-switch__chev" aria-hidden="true" />}
              <select
                aria-label="Switch workspace"
                value={activeWorkspaceId || ''}
                onChange={e => switchWorkspace(e.target.value)}
                disabled={workspaces.length < 2}
              >
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          {navSections.map((section, i) => (
            <React.Fragment key={section.title || i}>
              {section.title && <div className="nav-section-title">{section.title}</div>}
              {section.items.map(item => (item.path && item.feature && features[item.feature] === false ? (
                <Link key={item.path} to={`/plan?locked=${item.feature}`} className="nav-item nav-item-locked" title={`${item.label} — not included in your plan`}>
                  <item.icon />
                  <span className="nav-label">{item.label}</span>
                  <Lock size={13} className="nav-lock" style={{ marginLeft: 'auto' }} aria-label="not in your plan" />
                </Link>
              ) : item.path ? (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/dashboard' || item.path === '/instagram'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={tip(item.label)}
                  aria-label={collapsed ? item.label : undefined}
                >
                  <item.icon />
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ) : (
                <div key={item.label} className="nav-item nav-item-soon" title={item.hint}>
                  <item.icon />
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-soon">Soon</span>
                </div>
              )))}
              {section.title === 'Workspace' && isAdmin && (
                <NavLink
                  to={waiting.users ? '/admin?tab=pending' : waiting.upgrades ? '/admin?tab=upgrades' : '/admin'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={tip('Admin')}
                  aria-label={collapsed ? 'Admin' : undefined}
                >
                  <Shield />
                  <span className="nav-label">Admin</span>
                  {waitingCount > 0 && (
                    <span className="nav-count" title="Sign-ups and upgrade requests waiting for you">{waitingCount}</span>
                  )}
                </NavLink>
              )}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-badge" title={connected ? 'Shopify store connected' : 'No Shopify store connected yet — see Settings'}>
            <span className={`connection-dot ${connected ? 'connected' : ''}`} />
            <span>{connected ? (storeName ? storeName.replace(/^https?:\/\//, '') : 'Store connected') : 'No store connected'}</span>
          </div>
          <ThemeSwitch />
          <ThemeToggle className="sidebar-theme-toggle" />
          {user && (
            <div className="user-row">
              <Link to="/account" className="user-row__avatar" title={tip('Account')} aria-label="Account">{(user.email || '?').charAt(0)}</Link>
              <Link to="/account" className="user-row__mail" title="Account & security">{user.email}</Link>
              <button className="user-row__out" onClick={logout} title="Log out" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <div className="mobile-bar">
          <button onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link to="/dashboard"><img src="/favicon.svg" alt="" width="24" height="24" /> Article Writer</Link>
        </div>
        <Outlet context={{ connected, setConnected, storeName, setStoreName }} />
      </main>
    </div>
  );
}
