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
    const [views, searches, bestSellers] = await sql.transaction([
      sql`
        SELECT p.id, p.title, COUNT(v.id)::INTEGER AS views
        FROM products AS p
        LEFT JOIN product_views AS v
          ON v.product_id = p.id AND v.viewed_at > ${Math.floor(Date.now() / 1000) - 30 * 86400}
        WHERE p.status <> 'archived'
        GROUP BY p.id
        ORDER BY views DESC, p.title
        LIMIT 10
      `,
      sql`
        SELECT term, COUNT(*)::INTEGER AS searches
        FROM search_terms
        WHERE searched_at > ${Math.floor(Date.now() / 1000) - 30 * 86400}
        GROUP BY term
        ORDER BY searches DESC, term
        LIMIT 10
      `,
      sql`
        SELECT oi.title, SUM(oi.quantity)::INTEGER AS units
        FROM order_items AS oi
        JOIN orders AS o ON o.id = oi.order_id
        WHERE o.status = 'completed'
        GROUP BY oi.title
        ORDER BY units DESC, oi.title
        LIMIT 10
      `,
    ]);
    return jsonResponse({
      period_days: 30,
      product_views: views,
      top_searches: searches,
      best_sellers: bestSellers,
    });
  } catch (error) {
    console.error('Admin analytics query failed.', error);
    return jsonResponse({ error: 'Analitik belum dapat dimuat.' }, 500);
  }
};

export const config = { path: '/api/admin/analytics' };
