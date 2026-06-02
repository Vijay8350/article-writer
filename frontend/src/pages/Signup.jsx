import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserPlus, Loader2, MailCheck, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthCard from '../components/AuthCard';

const PLAN_LABELS = { free: 'Free trial', starter: 'Starter', growth: 'Growth', agency: 'Agency' };

export default function Signup() {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const planParam = params.get('plan');
  const planLabel = planParam && PLAN_LABELS[planParam];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Enter a valid email');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    if (!terms) return toast.error('Please accept the Terms & Privacy to continue');

    setSubmitting(true);
    try {
      await register(email.trim(), password, name.trim() || undefined);
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sign up failed');
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <AuthCard
        title="Account created"
        subtitle="Your account is awaiting administrator approval. You'll be able to sign in once it's approved."
        badge={planLabel ? `Signed up for: ${planLabel}` : null}
        footer={<Link to="/login">Back to Sign In</Link>}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <MailCheck size={48} style={{ color: 'var(--accent-success)' }} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Connect your Shopify store and publish your first article in minutes"
      badge={planLabel ? `You're signing up for: ${planLabel}` : null}
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="su-name">Name <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
          <input
            id="su-name"
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-email">Email</label>
          <input
            id="su-email"
            className="form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-pwd">Password</label>
          <div className="pwd-field">
            <input
              id="su-pwd"
              className="form-input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
        <div className="form-group">
          <label className="form-label" htmlFor="su-confirm">Confirm password</label>
          <input
            id="su-confirm"
            className="form-input"
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter password"
          />
          {confirm && confirm !== password && (
            <div className="form-helper" style={{ color: 'var(--accent-danger)' }}>Passwords don't match</div>
          )}
        </div>
        <label className="checkbox-group" style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
          <span>I agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link></span>
        </label>
        <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? <><Loader2 size={16} className="spinning" /> Creating...</> : <><UserPlus size={16} /> Create Account</>}
        </button>
      </form>
      <style>{`
        .pwd-field { position: relative; }
        .pwd-field .form-input { padding-right: 38px; }
        .pwd-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: 0; color: var(--text-muted); padding: 6px; border-radius: 6px; cursor: pointer; }
        .pwd-toggle:hover { color: var(--text-primary); }
        .checkbox-group { display: inline-flex; align-items: flex-start; gap: 8px; cursor: pointer; }
        .checkbox-group input { margin-top: 3px; }
        .spinning { animation: spin 1s linear infinite; }
      `}</style>
    </AuthCard>
  );
}
