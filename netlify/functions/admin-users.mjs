import { neon } from '@neondatabase/serverless';
import {
  activityWriteFailureMessage,
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { hashPassword } from '../../lib/passwords.mjs';
import { jsonResponse, originIsAllowed, requireAdmin } from './admin-security.mjs';

export default async (request) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });
  }
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);
  if (request.method !== 'GET' && !originIsAllowed(request)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  }

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireAdmin(request, sql);
  if (!auth.user) return auth.response;

  if (request.method === 'GET') {
    try {
      const users = await sql`SELECT id, email, role FROM users ORDER BY role, email LIMIT 500`;
      return jsonResponse({ users, current_user_id: auth.user.id });
    } catch (error) {
      console.error('Admin staff list failed.', error);
      return jsonResponse({ error: 'Akun staf tidak dapat dimuat.' }, 500);
    }
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
  const id = body?.id === undefined ? null : Number(body.id);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body?.role;
  const password = typeof body?.password === 'string' ? body.password : '';

  if (request.method === 'DELETE') {
    if (!Number.isSafeInteger(id) || id < 1) return jsonResponse({ error: 'ID akun tidak valid.' }, 400);
    try {
      const [result] = await sql`SELECT rockmerch_delete_staff_user(${id}, ${auth.user.id}) AS deleted`;
      if (result.deleted) {
        await recordAdminActivity(sql, auth.user.email, 'staff_deleted', JSON.stringify({ user_id: id }));
      }
      return result.deleted
        ? jsonResponse({ success: true })
        : jsonResponse({ error: 'Akun tidak ditemukan.' }, 404);
    } catch (error) {
      if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
      if (['R0001', 'R0003'].includes(error.code)) return jsonResponse({ error: 'Akun aktif atau admin terakhir tidak dapat dihapus.' }, 409);
      if (error.code === 'R0002') return jsonResponse({ error: 'Akun tidak ditemukan.' }, 404);
      console.error('Admin staff delete failed.', error);
      return jsonResponse({ error: 'Akun belum dapat dihapus.' }, 500);
    }
  }

  const isUpdate = request.method === 'PATCH';
  if (
    (isUpdate && (!Number.isSafeInteger(id) || id < 1))
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length > 254
    || !['admin', 'editor'].includes(role)
    || (password && (password.length < 14 || password.length > 256))
    || (!isUpdate && password.length < 14)
  ) {
    return jsonResponse({ error: 'Email, peran, atau kata sandi staf tidak valid.' }, 400);
  }
  if (id === Number(auth.user.id) && role !== 'admin') {
    return jsonResponse({ error: 'Peran akun yang sedang digunakan tidak dapat diturunkan.' }, 409);
  }

  try {
    const passwordHash = password ? await hashPassword(password) : null;
    const [user] = await sql`
      SELECT * FROM rockmerch_save_staff_user(
        ${id}::BIGINT, ${email}::TEXT, ${role}::TEXT, ${passwordHash}::TEXT
      )
    `;
    await recordAdminActivity(
      sql,
      auth.user.email,
      isUpdate ? 'staff_updated' : 'staff_added',
      JSON.stringify({
        user_id: user.id,
        role: user.role,
        password_changed: Boolean(password),
      }),
    );
    if (isUpdate && password) {
      await recordAdminActivity(sql, auth.user.email, 'password_changed', JSON.stringify({
        user_id: user.id,
      }));
    }
    return jsonResponse({ user }, isUpdate ? 200 : 201);
  } catch (error) {
    if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
    if (error.code === '23505') return jsonResponse({ error: 'Email tersebut sudah digunakan.' }, 409);
    if (['R0001', 'R0003'].includes(error.code)) return jsonResponse({ error: 'Admin terakhir tidak dapat diturunkan perannya.' }, 409);
    if (error.code === 'R0002') return jsonResponse({ error: 'Akun tidak ditemukan.' }, 404);
    console.error('Admin staff save failed.', error);
    return jsonResponse({ error: 'Akun belum dapat disimpan.' }, 500);
  }
};

export const config = { path: '/api/admin/users' };
