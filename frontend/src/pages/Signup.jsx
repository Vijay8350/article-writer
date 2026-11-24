import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthCard from '../components/AuthCard';
import Seo from '../components/Seo';
import { getPublicPlans } from '../lib/api';


export default function Signup() {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const planParam = params.get('plan');
  // A paid plan picked on the pricing section: everyone starts on Free, then asks for it in the app.
  const [chosen, setChosen] = useState(null);
  useEffect(() => {
    if (!planParam) return;
    getPublicPlans().then((r) => setChosen((r.data || []).find((p) => p.id === planParam && Number(p.price_inr) > 0) || null)).catch(() => {});
  }, [planParam]);
  const planLabel = chosen ? `You chose ${chosen.name}. You'll start on Free — request ${chosen.name} from Plan & usage once you're in.` : null;

  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Enter a valid email');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    if (!terms) return toast.error('Please accept the Terms & Privacy to continue');

    setSubmitting(true);
    try {
      await register(email.trim(), password, name.trim() || undefined, store.trim() || undefined);
      toast.success('Welcome! Your workspace is ready.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sign up failed');
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Free to start. Your first article can be live in minutes."
      badge={planLabel}
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <Seo
        title="Sign up free"
        description="Create your Article Writer account and connect your Shopify store. Generate SEO articles with your real product images — 5 free articles to start."
        path="/signup"
      />
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
          <label className="form-label" htmlFor="su-store">Store or business name <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
          <input
            id="su-store"
            className="form-input"
            value={store}
            onChange={e => setStore(e.target.value)}
            placeholder="e.g. Glowfinch"
            autoComplete="organization"
            maxLength={100}
          />
          <div className="form-helper">Your workspace gets this name. Everything you make is kept in it, private to you and the people you invite.</div>
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
          {submitting ? <><Loader2 size={16} className="spinning" /> Creating...</> : <>Create account</>}
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
