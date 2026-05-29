import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Dna, PenLine, FileText, CalendarClock, Gauge, Shield, Settings, LogOut } from 'lucide-react';
import { getSettings } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/business-dna', icon: Dna, label: 'Business DNA' },
  { path: '/generate', icon: PenLine, label: 'Generate Article' },
  { path: '/articles', icon: FileText, label: 'Existing Articles' },
  { path: '/scheduled', icon: CalendarClock, label: 'Scheduled Posts' },
  { path: '/plan', icon: Gauge, label: 'Plan & Usage' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [connected, setConnected] = useState(false);
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    getSettings()
      .then(res => {
        setConnected(res.data?.connected || false);
        setStoreName(res.data?.storeUrl || '');
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>✍️ Article Writer</h1>
          <p>Shopify Blog Engine</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
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
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.email}>
                {user.email}
              </span>
              <button
                className="btn btn-ghost"
                onClick={logout}
                title="Log out"
                style={{ padding: '6px 8px', flexShrink: 0 }}
              >
                <LogOut size={16} />
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
