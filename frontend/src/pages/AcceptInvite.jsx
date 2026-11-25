import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { acceptInvitation } from '../lib/api';
import AuthCard from '../components/AuthCard';
import '../styles/workspace.css';

// Public page in the same shell as sign-in / sign-up.
export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, refreshWorkspaces, switchWorkspace } = useAuth();
  const [state, setState] = useState('idle'); // idle | accepting | ok | error
  const [message, setMessage] = useState('');

  const handleAccept = async () => {
    setState('accepting');
    try {
      const res = await acceptInvitation(token);
      setMessage(res.message || 'Joined!');
      const ws = await refreshWorkspaces();
      const joined = ws.find(w => w.id === res.data.workspace_id);
      if (joined) switchWorkspace(joined.id);
      setState('ok');
      toast.success('Joined the workspace');
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not accept invitation');
      setState('error');
    }
  };

  if (authLoading) return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;

  // Not logged in → sign in first, keeping the token in the URL.
  if (!isAuthenticated) {
    return (
      <AuthCard
        badge="Workspace invitation"
        title="You're invited"
        subtitle="Sign in or create an account to join the workspace."
        footer={<>New to Glowquill? <Link to="/signup">Create an account</Link></>}
      >
        <Link to="/login" state={{ from: `/accept-invite/${token}` }} className="btn btn-primary w-full">Sign in to accept</Link>
      </AuthCard>
    );
  }

  if (state === 'ok') {
    return (
      <AuthCard title="You've joined" subtitle="Taking you to the app…">
        <div className="callout callout--success" role="status">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      </AuthCard>
    );
  }

  if (state === 'error') {
    return (
      <AuthCard title="Couldn't accept the invitation" subtitle="The link may have expired, been used already or be meant for another email.">
        <div className="callout callout--danger invite-state" role="alert">
          <AlertCircle size={18} />
          <span>{message}</span>
        </div>
        <Link to="/" className="btn btn-secondary w-full">Go home</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      badge="Workspace invitation"
      title="Join the workspace"
      subtitle="You've been invited to a workspace on Glowquill. Accept to join it."
    >
      <button className="btn btn-primary w-full" onClick={handleAccept} disabled={state === 'accepting'}>
        {state === 'accepting' ? <><Loader2 size={16} className="spinning" /> Accepting…</> : 'Accept invitation'}
      </button>
    </AuthCard>
  );
}
