import { neon } from '@neondatabase/serverless';

const jsonResponse = (body, status, headers = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

const originIsAllowed = (request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

export default async (request) => {
  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
  }
  if (!process.env.DATABASE_URL) {
    return jsonResponse({ error: 'Database is not configured.' }, 503);
  }

  const sql = neon(process.env.DATABASE_URL);
  if (request.method === 'GET') {
    const productId = new URL(request.url).searchParams.get('product_id') || '';
    if (!/^[1-9]\d{0,17}$/.test(productId)) {
      return jsonResponse({ error: 'Product ID is invalid.' }, 400);
    }
    try {
      const reviews = await sql`
        SELECT rating, comment, created_at
        FROM product_reviews
        WHERE product_id = ${productId}
          AND status = 'published'
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return jsonResponse({ reviews });
    } catch (error) {
      console.error('Published product reviews query failed.', error);
      return jsonResponse({ error: 'Unable to load product reviews.' }, 500);
    }
  }

  if (!originIsAllowed(request)) return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }
  const orderNumber = typeof body?.order_number === 'string'
    ? body.order_number.trim().toUpperCase()
    : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const itemId = String(body?.order_item_id ?? '');
  const rating = Number(body?.rating);
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
  if (
    !/^RM-\d{6}-[A-F0-9]{32}$/i.test(orderNumber)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !/^[1-9]\d{0,17}$/.test(itemId)
    || !Number.isInteger(rating) || rating < 1 || rating > 5
    || comment.length < 10 || comment.length > 1000
  ) {
    return jsonResponse({ error: 'Data ulasan tidak valid.' }, 400);
  }

  try {
    const [review] = await sql`
      INSERT INTO product_reviews(order_id, order_item_id, product_id, rating, comment, status)
      SELECT o.id, oi.id, oi.product_id, ${rating}, ${comment}, 'pending'
      FROM orders AS o
      JOIN order_items AS oi ON oi.order_id = o.id
      WHERE o.order_number = ${orderNumber}
        AND lower(o.email) = ${email}
        AND o.status = 'completed'
        AND oi.id = ${itemId}
        AND oi.product_id IS NOT NULL
      ON CONFLICT (order_item_id) DO NOTHING
      RETURNING id
    `;
    if (!review) {
      const [order] = await sql`
        SELECT status FROM orders
        WHERE order_number = ${orderNumber} AND lower(email) = ${email}
        LIMIT 1
      `;
      if (!order) return jsonResponse({ error: 'Nomor pesanan atau email tidak cocok.' }, 404);
      if (order.status !== 'completed') {
        return jsonResponse({ error: 'Ulasan dapat dikirim setelah pesanan selesai.' }, 409);
      }
      return jsonResponse({ error: 'Ulasan untuk item ini sudah dikirim atau item tidak cocok.' }, 409);
    }
    return jsonResponse({ success: true, status: 'pending' }, 201);
  } catch (error) {
    console.error('Customer review submission failed.', error);
    return jsonResponse({ error: 'Ulasan belum dapat dikirim.' }, 500);
  }
};

export const config = { path: '/api/reviews' };
