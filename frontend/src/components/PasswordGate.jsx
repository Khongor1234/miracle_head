import { useState } from 'react';
import { api, setPassword, UnauthorizedError } from '../api';
import { useLang } from '../LanguageContext';
import './PasswordGate.css';

export default function PasswordGate({ onUnlock }) {
  const { t } = useLang();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const candidate = value.trim();
    if (!candidate) return;
    setChecking(true);
    setError('');
    setPassword(candidate);
    try {
      await api.getSettings();
      onUnlock();
    } catch (err) {
      setError(err instanceof UnauthorizedError ? t.gate.wrong : t.gate.unreachable);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="password-gate">
      <form className="password-gate-card" onSubmit={handleSubmit}>
        <h1 className="password-gate-title">{t.gate.title}</h1>
        <p className="password-gate-body">{t.gate.body}</p>
        <input
          className="password-gate-input"
          type="password"
          autoComplete="current-password"
          aria-label={t.gate.label}
          placeholder={t.gate.label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />
        {error && <p className="password-gate-error" role="alert">{error}</p>}
        <button className="password-gate-submit" type="submit" disabled={checking || !value.trim()}>
          {checking ? t.gate.checking : t.gate.submit}
        </button>
      </form>
    </div>
  );
}
