import { neon } from '@neondatabase/serverless';
import { jsonResponse, requireAdmin } from './admin-security.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  }
  if (!process.env.DATABASE_URL) {
    return jsonResponse({ error: 'Database is not configured.' }, 503);
  }

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireAdmin(request, sql);
  if (!auth.user) return auth.response;

  try {
    const activities = await sql`
      SELECT id, actor, action, details, created_at
      FROM admin_activity
      ORDER BY created_at DESC, id DESC
      LIMIT 300
    `;
    return jsonResponse({ activities });
  } catch (error) {
    console.error('Admin activity history query failed.', error);
    return jsonResponse({ error: 'Riwayat aktivitas admin tidak dapat dimuat.' }, 500);
  }
};

export const config = { path: '/api/admin/activity' };
