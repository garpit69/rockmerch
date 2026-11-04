import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { verifyPassword } from '../../lib/passwords.mjs';
import {
  cookieName,
  createSessionToken,
  hashToken,
  jsonResponse,
  originIsAllowed,
  readCookie,
  requireStaff,
  sessionCookie,
  sessionExpiresAt,
} from './admin-security.mjs';

const identityHash = (kind, value) =>
  createHash('sha256').update(`${kind}|${value}`).digest('hex');

export default async (request) => {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' });
  }
  if (!process.env.DATABASE_URL) {
    return jsonResponse({ error: 'Database is not configured.' }, 503);
  }

  const sql = neon(process.env.DATABASE_URL);
  if (request.method === 'GET') {
    const auth = await requireStaff(request, sql);
    return auth.user
      ? jsonResponse({ user: { email: auth.user.email, role: auth.user.role } })
      : auth.response;
  }

  if (!originIsAllowed(request)) return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'DELETE') {
    const sessionToken = readCookie(request, cookieName);
    if (sessionToken && /^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
      try {
        await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(sessionToken)}`;
      } catch (error) {
        console.error('Admin logout could not revoke its session.', error);
        return jsonResponse({ error: 'Could not end the admin session.' }, 500);
      }
    }
    return jsonResponse({ success: true }, 200, {
      'Set-Cookie': sessionCookie(request, '', 0),
    });
  }

  let body;
  try {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
    }
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 1 || password.length > 256) {
    return jsonResponse({ error: 'Email atau kata sandi tidak valid.' }, 400);
  }

  const ip = request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown';
  const identities = [
    identityHash('ip', ip),
    identityHash('email', email),
  ];
  try {
    const recentCutoff = Math.floor(Date.now() / 1000) - 900;
    await sql`DELETE FROM login_attempts WHERE attempted_at < ${recentCutoff}`;
    const [attempts] = await sql`
      SELECT COALESCE(MAX(attempt_count), 0)::INTEGER AS count
      FROM (
        SELECT COUNT(*) AS attempt_count
        FROM login_attempts
        WHERE identity_hash IN (${identities[0]}, ${identities[1]})
          AND attempted_at > ${recentCutoff}
        GROUP BY identity_hash
      ) AS recent_attempts
    `;
    if (attempts.count >= 5) {
      return jsonResponse({ error: 'Terlalu banyak percobaan masuk. Coba lagi 15 menit kemudian.' }, 429, {
        'Retry-After': '900',
      });
    }

    const [user] = await sql`
      SELECT id, email, password, role
      FROM users
      WHERE lower(email) = ${email} AND role IN ('admin', 'editor')
      LIMIT 1
    `;
    const passwordMatches = user ? await verifyPassword(password, user.password) : false;
    if (!user || !passwordMatches) {
      const attemptedAt = Math.floor(Date.now() / 1000);
      await sql`
        INSERT INTO login_attempts(identity_hash, attempted_at)
        VALUES (${identities[0]}, ${attemptedAt}), (${identities[1]}, ${attemptedAt})
      `;
      return jsonResponse({ error: 'Email atau kata sandi tidak cocok.' }, 401);
    }

    await sql`DELETE FROM login_attempts WHERE identity_hash IN (${identities[0]}, ${identities[1]})`;
    const token = createSessionToken();
    await sql`
      INSERT INTO admin_sessions(token_hash, user_id, expires_at)
      VALUES (${hashToken(token)}, ${user.id}, ${sessionExpiresAt()})
    `;
    return jsonResponse(
      { user: { email: user.email, role: user.role } },
      200,
      { 'Set-Cookie': sessionCookie(request, token) },
    );
  } catch (error) {
    console.error('Admin login failed due to a server error.', error);
    return jsonResponse({ error: 'Admin login is temporarily unavailable.' }, 500);
  }
};

export const config = { path: '/api/admin/auth' };
