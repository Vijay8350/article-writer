import React, { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { changeMyPassword } from '../lib/api';

export default function Account() {
  const { user } = useAuth();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPwd) return toast.error('Enter your current password');
    if (newPwd.length < 8) return toast.error('New password must be at least 8 characters');
    if (newPwd !== confirm) return toast.error('New passwords do not match');
    if (currentPwd === newPwd) return toast.error('Pick a password different from your current one');

    setSubmitting(true);
    try {
      await changeMyPassword(currentPwd, newPwd);
      toast.success('Password updated');
      setCurrentPwd(''); setNewPwd(''); setConfirm('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    }
    setSubmitting(false);
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>👤 Account</h1>
        <p>Your account details and security</p>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card mb-24">
          <div className="card-header"><h2>Profile</h2></div>
          <div className="card-body">
            <div className="dna-section">
              <div className="dna-section-title">Email</div>
              <p>{user?.email}</p>
            </div>
            {user?.name && (
              <div className="dna-section mt-16">
                <div className="dna-section-title">Name</div>
                <p>{user.name}</p>
              </div>
            )}
            <div className="dna-section mt-16">
              <div className="dna-section-title">Role</div>
              <span className="badge badge-purple">{user?.role}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2><ShieldCheck size={16} /> Change password</h2></div>
          <div className="card-body">
            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="form-group">
                <label className="form-label" htmlFor="cur">Current password</label>
                <div className="pwd-field">
                  <input
                    id="cur"
                    className="form-input"
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowCurrent(v => !v)} tabIndex={-1}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}>
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="new">New password</label>
                <div className="pwd-field">
                  <input
                    id="new"
                    className="form-input"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowNew(v => !v)} tabIndex={-1}
                    aria-label={showNew ? 'Hide password' : 'Show password'}>
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="form-helper">At least 8 characters.</div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="conf">Confirm new password</label>
                <input
                  id="conf"
                  className="form-input"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                />
                {confirm && confirm !== newPwd && (
                  <div className="form-helper" style={{ color: 'var(--accent-danger)' }}>Passwords don't match</div>
                )}
              </div>
              <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
                {submitting ? <><Loader2 size={16} className="spinning" /> Updating...</> : <><KeyRound size={16} /> Update password</>}
              </button>
            </form>
          </div>
        </div>
      </div>
      <style>{`
        .pwd-field { position: relative; }
        .pwd-field .form-input { padding-right: 38px; }
        .pwd-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: 0; color: var(--text-muted); padding: 6px; border-radius: 6px; cursor: pointer; }
        .pwd-toggle:hover { color: var(--text-primary); }
        .spinning { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
