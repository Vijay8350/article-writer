import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthCard from '../components/AuthCard';
import Seo from '../components/Seo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return toast.error('Enter your email and password');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      toast.success('Welcome back!');
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.error
        || (code === 'PENDING' ? 'Your account is awaiting approval.'
          : code === 'SUSPENDED' ? 'Your account has been suspended.'
          : 'Login failed');
      toast.error(msg);
    }
    setSubmitting(false);
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Article Writer account"
      footer={<>Don't have an account? <Link to="/signup">Sign up free</Link></>}
    >
      <Seo
        title="Sign in"
        description="Sign in to your Article Writer account to generate and publish SEO articles to your Shopify blog."
        path="/login"
      />
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            className="form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="login-pwd">Password</label>
          <div className="pwd-field">
            <input
              id="login-pwd"
              className="form-input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="pwd-toggle"
              aria-label={showPwd ? 'Hide password' : 'Show password'}
              onClick={() => setShowPwd(v => !v)}
              tabIndex={-1}
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="auth-row">
          <label className="checkbox-group">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <button
            type="button"
            className="link-btn"
            onClick={() => toast('Password reset is coming soon. Email support meanwhile.', { icon: '📧' })}
          >
            Forgot password?
          </button>
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? <><Loader2 size={16} className="spinning" /> Signing in...</> : <><LogIn size={16} /> Sign In</>}
        </button>
      </form>
      <style>{`
        .pwd-field { position: relative; }
        .pwd-field .form-input { padding-right: 38px; }
        .pwd-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: 0; color: var(--text-muted); padding: 6px; border-radius: 6px; cursor: pointer; }
        .pwd-toggle:hover { color: var(--text-primary); }
        .auth-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .auth-row .checkbox-group { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
        .link-btn { background: transparent; border: 0; color: var(--accent-primary); font-size: 13px; cursor: pointer; padding: 0; }
        .link-btn:hover { color: var(--accent-primary-hover); }
        .spinning { animation: spin 1s linear infinite; }
      `}</style>
    </AuthCard>
  );
}
