import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return toast.error('Enter your email and password');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      toast.success('Welcome back!');
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    }
    setSubmitting(false);
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">
          <h1>✍️ Article Writer</h1>
          <p>Sign in to your account</p>
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? <><Loader2 size={16} className="spinning" /> Signing in...</> : <><LogIn size={16} /> Sign In</>}
        </button>
        <p className="auth-switch">
          Don't have an account? <Link to="/signup">Create one</Link>
        </p>
      </form>
      <style>{`
        .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .auth-card { width: 100%; max-width: 400px; padding: 32px; }
        .auth-logo { text-align: center; margin-bottom: 28px; }
        .auth-logo h1 { font-size: 24px; margin-bottom: 6px; }
        .auth-logo p { color: var(--text-secondary); font-size: 14px; }
        .auth-switch { text-align: center; margin-top: 20px; font-size: 14px; color: var(--text-secondary); }
        .auth-switch a { color: var(--accent-primary, #8b5cf6); text-decoration: none; }
        .spinning { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
