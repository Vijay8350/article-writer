import React, { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { changeMyPassword } from '../lib/api';
import { PageHeader, Section, SettingRow } from '../components/ui';
import '../styles/workspace.css';

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
    <div className="page-container page-container--narrow fade-in wk-page">
      <PageHeader title="Account" subtitle="Your sign-in details, appearance and password." />

      <div className="stack">
        <Section title="Profile">
          <dl className="kv">
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            {user?.name && (
              <>
                <dt>Name</dt>
                <dd>{user.name}</dd>
              </>
            )}
            <dt>Role</dt>
            <dd><span className="badge badge-purple wk-cap">{user?.role}</span></dd>
          </dl>
        </Section>

        <Section title="Appearance">
          <SettingRow title="Theme" description="System follows your device's light or dark setting. Saved in this browser.">
            <ThemeSwitch labels />
          </SettingRow>
        </Section>

        <Section title="Change password" description="You'll use the new password the next time you sign in.">
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

            <div className="form-grid acct-new-pwd">
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
                  <div className="form-helper wk-note-danger">Passwords don't match</div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? <><Loader2 size={16} className="spinning" /> Updating…</> : <><KeyRound size={16} /> Update password</>}
              </button>
            </div>
          </form>
        </Section>
      </div>
    </div>
  );
}
