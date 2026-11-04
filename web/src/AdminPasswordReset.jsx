import { useState } from 'react';

export default function AdminPasswordReset() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (token && password !== confirmation) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token
          ? { action: 'reset', token, password }
          : { action: 'request', email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Permintaan belum dapat diproses.');
      setMessage(result.message);
      setPassword('');
      setConfirmation('');
    } catch (requestError) {
      console.error('Password reset request failed.', requestError);
      setError(requestError.message || 'Permintaan belum dapat diproses.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="migration-commerce-page migration-admin-login">
      <a className="back-link" href="/?page=admin">← Kembali ke login admin</a>
      <span className="eyebrow">PEMULIHAN AKUN</span>
      <h1>{token ? 'Buat kata sandi baru.' : 'Lupa kata sandi?'}</h1>
      <p>
        {token
          ? 'Tautan berlaku 30 menit. Gunakan kata sandi unik minimal 14 karakter.'
          : 'Masukkan email akun staf. Jika terdaftar, kami akan mengirim tautan pemulihan.'}
      </p>
      {error && <p className="migration-state migration-state-error" role="alert">{error}</p>}
      {message && <p className="migration-cart-notice" role="status">{message}</p>}
      <form className="checkout-form" onSubmit={submit}>
        {token ? (
          <>
            <label>Kata sandi baru
              <input
                type="password"
                autoComplete="new-password"
                minLength="14"
                maxLength="256"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>Ulangi kata sandi baru
              <input
                type="password"
                autoComplete="new-password"
                minLength="14"
                maxLength="256"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </>
        ) : (
          <label>Email akun
            <input
              type="email"
              autoComplete="email"
              maxLength="254"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        )}
        <button className="button button-dark" disabled={saving}>
          {saving ? 'Memproses…' : token ? 'Simpan kata sandi' : 'Kirim tautan pemulihan'}
        </button>
      </form>
    </main>
  );
}
