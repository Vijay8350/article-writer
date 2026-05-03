import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Dna, PenLine, FileText, Settings, Wifi, WifiOff } from 'lucide-react';
import { getSettings } from '../lib/api';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/business-dna', icon: Dna, label: 'Business DNA' },
  { path: '/generate', icon: PenLine, label: 'Generate Article' },
  { path: '/articles', icon: FileText, label: 'Existing Articles' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
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
        </div>
      </aside>

      <main className="main-content">
        <Outlet context={{ connected, setConnected, storeName, setStoreName }} />
      </main>
    </div>
  );
}
