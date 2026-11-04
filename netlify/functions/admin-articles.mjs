import { neon } from '@neondatabase/serverless';
import {
  activityWriteFailureMessage,
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { jsonResponse, originIsAllowed, requireStaff } from './admin-security.mjs';

const statuses = new Set(['draft', 'published', 'scheduled']);

const readBody = async (request) => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return { error: 'Content-Type must be application/json.' };
  }
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? { body }
      : { error: 'Request body must be a JSON object.' };
  } catch {
    return { error: 'Request body must be valid JSON.' };
  }
};

const safeSlug = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 170);

const validImage = (value) => {
  if (!value) return true;
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export default async (request) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });
  }
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);
  if (request.method !== 'GET' && !originIsAllowed(request)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  }

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireStaff(request, sql);
  if (!auth.user) return auth.response;

  if (request.method === 'GET') {
    try {
      const articles = await sql`
        SELECT id, title, slug, category, excerpt, content, image, status, publish_at, created_at
        FROM articles
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `;
      return jsonResponse({ articles });
    } catch (error) {
      console.error('Admin article list failed.', error);
      return jsonResponse({ error: 'Artikel tidak dapat dimuat.' }, 500);
    }
  }

  const parsed = await readBody(request);
  if (parsed.error) return jsonResponse({ error: parsed.error }, 400);
  const body = parsed.body;
  const id = body.id === undefined ? null : Number(body.id);
  if (request.method !== 'POST' && (!Number.isSafeInteger(id) || id < 1)) {
    return jsonResponse({ error: 'ID artikel tidak valid.' }, 400);
  }
  if (request.method === 'DELETE') {
    try {
      const [deleted] = await sql`DELETE FROM articles WHERE id = ${id} RETURNING id, title`;
      if (deleted) {
        await recordAdminActivity(sql, auth.user.email, 'article_deleted', JSON.stringify({
          article_id: deleted.id,
          title: deleted.title,
        }));
      }
      return deleted
        ? jsonResponse({ success: true })
        : jsonResponse({ error: 'Artikel tidak ditemukan.' }, 404);
    } catch (error) {
      if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
      console.error('Admin article delete failed.', error);
      return jsonResponse({ error: 'Artikel belum dapat dihapus.' }, 500);
    }
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const slug = safeSlug(body.slug || title);
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
  const content = typeof body.content === 'string' ? body.content : '';
  const image = typeof body.image === 'string' ? body.image.trim() : '';
  const status = body.status || 'draft';
  let publishAt = null;
  if (body.publish_at) {
    const date = new Date(body.publish_at);
    if (Number.isNaN(date.getTime())) return jsonResponse({ error: 'Jadwal artikel tidak valid.' }, 400);
    publishAt = date.toISOString();
  }
  if (
    !title || title.length > 200
    || !slug || slug.length > 170
    || category.length > 120 || excerpt.length > 600 || content.length > 20_000
    || !validImage(image)
    || !statuses.has(status)
    || (status === 'scheduled' && !publishAt)
  ) {
    return jsonResponse({ error: 'Judul, slug, status, gambar, atau panjang isi artikel tidak valid.' }, 400);
  }

  try {
    const [article] = request.method === 'POST'
      ? await sql`
        INSERT INTO articles(title, slug, category, excerpt, content, image, status, publish_at)
        VALUES (${title}, ${slug}, ${category}, ${excerpt}, ${content}, ${image}, ${status}, ${publishAt})
        RETURNING id, title, slug, status, publish_at
      `
      : await sql`
        UPDATE articles
        SET title = ${title}, slug = ${slug}, category = ${category}, excerpt = ${excerpt},
          content = ${content}, image = ${image}, status = ${status}, publish_at = ${publishAt}
        WHERE id = ${id}
        RETURNING id, title, slug, status, publish_at
      `;
    if (article) {
      await recordAdminActivity(
        sql,
        auth.user.email,
        request.method === 'POST' ? 'article_created' : 'article_updated',
        JSON.stringify({ article_id: article.id, title: article.title }),
      );
    }
    return article
      ? jsonResponse({ article }, request.method === 'POST' ? 201 : 200)
      : jsonResponse({ error: 'Artikel tidak ditemukan.' }, 404);
  } catch (error) {
    if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
    if (error.code === '23505') return jsonResponse({ error: 'Slug artikel sudah digunakan.' }, 409);
    console.error('Admin article save failed.', error);
    return jsonResponse({ error: 'Artikel belum dapat disimpan.' }, 500);
  }
};

export const config = { path: '/api/admin/articles' };
