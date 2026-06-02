import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { acceptInvitation } from '../lib/api';

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

  // Not logged in → bounce to login, preserving the token in the URL.
  if (!isAuthenticated) {
    return (
      <div className="page-container">
        <div className="card" style={{ maxWidth: 480, margin: '40px auto', padding: 32, textAlign: 'center' }}>
          <h2>You're invited to a workspace</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 20 }}>
            Sign in or sign up to accept this invitation.
          </p>
          <Link to="/login" state={{ from: `/accept-invite/${token}` }} className="btn btn-primary w-full">Sign in</Link>
          <Link to="/signup" style={{ display: 'block', marginTop: 12, fontSize: 14 }}>Or create an account</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="card" style={{ maxWidth: 480, margin: '40px auto', padding: 32, textAlign: 'center' }}>
        {state === 'ok' ? (
          <>
            <CheckCircle2 size={48} style={{ color: 'var(--accent-success, #10b981)', margin: '0 auto 16px' }} />
            <h2>Joined!</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{message}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Redirecting...</p>
          </>
        ) : state === 'error' ? (
          <>
            <AlertCircle size={48} style={{ color: 'var(--accent-danger, #ef4444)', margin: '0 auto 16px' }} />
            <h2>Couldn't accept</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 20 }}>{message}</p>
            <Link to="/" className="btn btn-secondary">Go home</Link>
          </>
        ) : (
          <>
            <h2>Accept workspace invitation</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8, marginBottom: 24 }}>
              Click below to join the workspace you were invited to.
            </p>
            <button className="btn btn-primary w-full" onClick={handleAccept} disabled={state === 'accepting'}>
              {state === 'accepting' ? <><Loader2 size={16} className="spinning" /> Accepting...</> : 'Accept invitation'}
            </button>
          </>
        )}
        <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
      </div>
    </div>
  );
}
