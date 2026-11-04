import { neon } from '@neondatabase/serverless';
import {
  activityWriteFailureMessage,
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { jsonResponse, originIsAllowed, requireAdmin } from './admin-security.mjs';

export default async (request) => {
  if (!['GET', 'PATCH'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PATCH' });
  }
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);
  if (request.method === 'PATCH' && !originIsAllowed(request)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  }

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireAdmin(request, sql);
  if (!auth.user) return auth.response;

  if (request.method === 'GET') {
    try {
      const reviews = await sql`
        SELECT r.id, r.order_id, r.order_item_id, r.product_id, r.rating, r.comment,
          r.status, r.created_at, oi.title AS product_title, oi.format,
          o.order_number, o.customer_name
        FROM product_reviews AS r
        JOIN orders AS o ON o.id = r.order_id
        JOIN order_items AS oi ON oi.id = r.order_item_id
        ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
        LIMIT 500
      `;
      return jsonResponse({ reviews });
    } catch (error) {
      console.error('Admin review list failed.', error);
      return jsonResponse({ error: 'Ulasan tidak dapat dimuat.' }, 500);
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
  const id = Number(body?.id);
  if (!Number.isSafeInteger(id) || id < 1 || !['pending', 'published', 'rejected'].includes(body?.status)) {
    return jsonResponse({ error: 'Status ulasan tidak valid.' }, 400);
  }

  try {
    const [review] = await sql`
      UPDATE product_reviews
      SET status = ${body.status}
      WHERE id = ${id}
      RETURNING id, status
    `;
    if (review) {
      await recordAdminActivity(sql, auth.user.email, 'review_moderated', JSON.stringify({
        review_id: review.id,
        status: review.status,
      }));
    }
    return review
      ? jsonResponse({ review })
      : jsonResponse({ error: 'Ulasan tidak ditemukan.' }, 404);
  } catch (error) {
    if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
    console.error('Admin review moderation failed.', error);
    return jsonResponse({ error: 'Ulasan belum dapat diperbarui.' }, 500);
  }
};

export const config = { path: '/api/admin/reviews' };
