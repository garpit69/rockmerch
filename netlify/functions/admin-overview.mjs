import { neon } from '@neondatabase/serverless';
import { jsonResponse, requireAdmin } from './admin-security.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  }
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireAdmin(request, sql);
  if (!auth.user) return auth.response;

  try {
    const [counts, lowStock, bestSellers, pendingReviews] = await sql.transaction([
      sql`
        SELECT
          (SELECT COUNT(*)::INTEGER FROM orders WHERE status IN ('awaiting_payment', 'awaiting_confirmation')) AS new_order_count,
          (SELECT COALESCE(SUM(total), 0)::BIGINT FROM orders
            WHERE status = 'completed' AND (updated_at AT TIME ZONE 'Asia/Jakarta')::DATE =
              (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE) AS today_revenue,
          (SELECT COALESCE(SUM(total), 0)::BIGINT FROM orders
            WHERE status = 'completed' AND date_trunc('month', updated_at AT TIME ZONE 'Asia/Jakarta') =
              date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')) AS month_revenue,
          (SELECT COUNT(*)::INTEGER FROM products WHERE status <> 'archived') AS product_count,
          (SELECT COUNT(*)::INTEGER FROM articles WHERE status <> 'archived') AS article_count
      `,
      sql`
        SELECT p.id, p.title, p.artist,
          COALESCE(f.value->>'format', f.value->>'name', '') AS format,
          CASE WHEN COALESCE(f.value->>'stock', '') ~ '^[0-9]+$'
            THEN (f.value->>'stock')::INTEGER ELSE 0 END AS stock
        FROM products AS p
        CROSS JOIN LATERAL jsonb_array_elements(p.formats) AS f(value)
        WHERE p.status = 'published'
          AND CASE WHEN COALESCE(f.value->>'stock', '') ~ '^[0-9]+$'
            THEN (f.value->>'stock')::INTEGER ELSE 0 END <= 3
        ORDER BY stock, p.title
        LIMIT 20
      `,
      sql`
        SELECT oi.title, SUM(oi.quantity)::INTEGER AS units
        FROM order_items AS oi
        JOIN orders AS o ON o.id = oi.order_id
        WHERE o.status = 'completed'
        GROUP BY oi.title
        ORDER BY units DESC, oi.title
        LIMIT 5
      `,
      sql`SELECT COUNT(*)::INTEGER AS count FROM product_reviews WHERE status = 'pending'`,
    ]);
    return jsonResponse({
      ...counts[0],
      low_stock_products: lowStock,
      best_sellers: bestSellers,
      pending_review_count: pendingReviews[0].count,
    });
  } catch (error) {
    console.error('Admin dashboard query failed.', error);
    return jsonResponse({ error: 'Ringkasan toko tidak dapat dimuat.' }, 500);
  }
};

export const config = { path: '/api/admin/overview' };
