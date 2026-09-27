import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BusinessDna from './pages/BusinessDna';
import GenerateArticle from './pages/GenerateArticle';
import ExistingArticles from './pages/ExistingArticles';
import ScheduledPosts from './pages/ScheduledPosts';
import Campaigns from './pages/Campaigns';
import InstagramAccounts from './pages/InstagramAccounts';
import InstagramScheduler from './pages/InstagramScheduler';
import PlanUsage from './pages/PlanUsage';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Workspaces from './pages/Workspaces';
import Members from './pages/Members';
import Account from './pages/Account';
import AcceptInvite from './pages/AcceptInvite';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import { useAuth } from './context/AuthContext';

function FullPageSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner spinner-lg" />
    </div>
  );
}

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

// "/" — logged-out users see the marketing landing; logged-in users go to the app.
function RootRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

// /login + /signup — bounce to /dashboard if already logged in.
function PublicOnly({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public marketing + auth */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />

      {/* Authenticated app — everything inside the sidebar Layout */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/business-dna" element={<BusinessDna />} />
        <Route path="/generate" element={<GenerateArticle />} />
        <Route path="/articles" element={<ExistingArticles />} />
        <Route path="/scheduled" element={<ScheduledPosts />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/instagram" element={<InstagramAccounts />} />
        <Route path="/instagram-scheduler" element={<InstagramScheduler />} />
        <Route path="/plan" element={<PlanUsage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/members" element={<Members />} />
        <Route path="/account" element={<Account />} />
      </Route>

      {/* Anything else → landing for public, dashboard for authed */}
      <Route path="*" element={<RootRoute />} />
    </Routes>
  );
}
