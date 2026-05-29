import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return toast.error('Enter your email and password');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    setSubmitting(true);
    try {
      await register(email.trim(), password, name.trim() || undefined);
      toast.success('Account created!');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sign up failed');
    }
    setSubmitting(false);
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">
          <h1>✍️ Article Writer</h1>
          <p>Create your account</p>
        </div>
        <div className="form-group">
          <label className="form-label">Name <span style={{ color: 'var(--text-secondary)' }}>(optional)</span></label>
          <input className="form-input" value={name}
            onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          <div className="form-helper">Minimum 8 characters.</div>
        </div>
        <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? <><Loader2 size={16} className="spinning" /> Creating...</> : <><UserPlus size={16} /> Create Account</>}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
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
