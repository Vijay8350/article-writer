import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Dna, PenLine, FileText, CalendarClock, Rocket, Gauge, Shield, Settings, LogOut, Users, Building2 } from 'lucide-react';
import { getSettings } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/business-dna', icon: Dna, label: 'Business DNA' },
  { path: '/generate', icon: PenLine, label: 'Generate Article' },
  { path: '/campaigns', icon: Rocket, label: 'Campaigns' },
  { path: '/articles', icon: FileText, label: 'Existing Articles' },
  { path: '/scheduled', icon: CalendarClock, label: 'Scheduled Posts' },
  { path: '/plan', icon: Gauge, label: 'Plan & Usage' },
  { path: '/members', icon: Users, label: 'Members' },
  { path: '/workspaces', icon: Building2, label: 'Workspaces' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout, workspaces, activeWorkspaceId, activeRole, switchWorkspace } = useAuth();
  const [connected, setConnected] = useState(false);
  const [storeName, setStoreName] = useState('');

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
          <h1>✍️ Article Writer</h1>
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
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Shield />
              Admin
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
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10 }} title={user.email}>
                {user.email}
              </div>
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
