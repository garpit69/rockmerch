import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../lib/passwords.mjs';
import { hashToken, jsonResponse, originIsAllowed } from './admin-security.mjs';

const genericMessage = 'Jika email terdaftar, tautan pemulihan akan dikirim dan berlaku selama 30 menit.';
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }
  if (!originIsAllowed(request)) return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);

  let body;
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 8192) return jsonResponse({ error: 'Request is too large.' }, 413);
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
    }
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }

  const sql = neon(process.env.DATABASE_URL);
  if (body?.action === 'request') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!validEmail(email) || email.length > 254) {
      return jsonResponse({ error: 'Format email tidak valid.' }, 400);
    }

    try {
      const token = randomBytes(32).toString('base64url');
      const resetUrl = new URL(request.url);
      resetUrl.pathname = '/';
      resetUrl.search = '';
      resetUrl.searchParams.set('page', 'admin-reset');
      resetUrl.searchParams.set('token', token);
      await sql`
        SELECT rockmerch_queue_password_reset(
          ${email}, ${hashToken(token)}, ${resetUrl.toString()}
        ) AS queued
      `;
      return jsonResponse({ message: genericMessage });
    } catch (error) {
      console.error('Password reset request failed.', error);
      return jsonResponse({ error: 'Permintaan pemulihan belum dapat diproses.' }, 500);
    }
  }

  if (body?.action === 'reset') {
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || password.length < 14 || password.length > 256) {
      return jsonResponse({ error: 'Tautan tidak valid atau kata sandi kurang dari 14 karakter.' }, 400);
    }

    try {
      const passwordHash = await hashPassword(password);
      const [result] = await sql`
        SELECT rockmerch_consume_password_reset(
          ${hashToken(token)}, ${passwordHash}
        ) AS updated
      `;
      if (!result.updated) {
        return jsonResponse({ error: 'Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.' }, 400);
      }
      return jsonResponse({ message: 'Kata sandi diperbarui. Silakan masuk kembali.' });
    } catch (error) {
      console.error('Password reset failed.', error);
      return jsonResponse({ error: 'Kata sandi belum dapat diperbarui.' }, 500);
    }
  }

  return jsonResponse({ error: 'Action pemulihan tidak valid.' }, 400);
};

export const config = { path: '/api/admin/password-reset' };
