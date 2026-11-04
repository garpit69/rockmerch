import { createHash, randomBytes } from 'node:crypto';

const sessionCookieName = 'rm_admin_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;

export const jsonResponse = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const readCookie = (request, name) => {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const segment of cookieHeader.split(';')) {
    const [key, ...parts] = segment.trim().split('=');
    if (key === name) return parts.join('=');
  }
  return '';
};

export const sessionCookie = (request, token, maxAge = sessionDurationMs / 1000) => {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
};

export const getAdminSession = async (request, sql) => {
  const token = readCookie(request, sessionCookieName);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [session] = await sql`
    SELECT u.id, u.email, u.role
    FROM admin_sessions AS s
    JOIN users AS u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > NOW()
      AND u.role IN ('admin', 'editor')
    LIMIT 1
  `;
  return session || null;
};

export const requireAdmin = async (request, sql) => {
  const auth = await requireStaff(request, sql);
  if (auth.response) return auth;
  return auth.user.role === 'admin'
    ? auth
    : { response: jsonResponse({ error: 'Admin role required.' }, 403) };
};

export const requireStaff = async (request, sql) => {
  try {
    const user = await getAdminSession(request, sql);
    return user
      ? { user }
      : { response: jsonResponse({ error: 'Staff authentication required.' }, 401) };
  } catch (error) {
    console.error('Admin session validation failed.', error);
    return { response: jsonResponse({ error: 'Admin session could not be verified.' }, 500) };
  }
};

export const originIsAllowed = (request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

export const createSessionToken = () => randomBytes(32).toString('base64url');
export const sessionExpiresAt = () => new Date(Date.now() + sessionDurationMs).toISOString();
export const cookieName = sessionCookieName;
