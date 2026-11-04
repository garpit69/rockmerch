import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const jsonResponse = (body, status) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const validOrderNumber = (value) => /^RM-\d{6}-[A-F0-9]{32}$/i.test(value);

const parseBody = async (request) => {
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

const hashIdentity = (kind, value) =>
  createHash('sha256').update(`${kind}|${value}`).digest('hex');

export default async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  if (!process.env.DATABASE_URL) {
    return jsonResponse({ error: 'Database is not configured.' }, 503);
  }

  const parsed = await parseBody(request);
  if (parsed.error) return jsonResponse({ error: parsed.error }, 400);
  const orderNumber = typeof parsed.body.order_number === 'string'
    ? parsed.body.order_number.trim().toUpperCase()
    : '';
  const email = typeof parsed.body.email === 'string'
    ? parsed.body.email.trim().toLowerCase()
    : '';
  if (!validOrderNumber(orderNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Nomor pesanan atau email tidak cocok.' }, 400);
  }

  const clientIp = request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown';
  const ipHash = hashIdentity('order-lookup-ip', clientIp);
  const orderHash = hashIdentity('order-lookup-order', orderNumber);
  const cutoff = Math.floor(Date.now() / 1000) - 900;

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`DELETE FROM login_attempts WHERE attempted_at < ${cutoff}`;
    const [attempts] = await sql`
      SELECT COALESCE(MAX(attempt_count), 0)::INTEGER AS count
      FROM (
        SELECT COUNT(*) AS attempt_count
        FROM login_attempts
        WHERE identity_hash IN (${ipHash}, ${orderHash})
          AND attempted_at > ${cutoff}
        GROUP BY identity_hash
      ) AS recent_attempts
    `;
    if (attempts.count >= 10) {
      return jsonResponse({ error: 'Terlalu banyak percobaan. Coba lagi 15 menit kemudian.' }, 429);
    }

    const [order] = await sql`
      SELECT id, order_number, customer_name,
        subtotal, shipping, total, payment_method, status,
        transfer_bank_code, transfer_bank_account, transfer_account_name,
        payment_url, shipping_carrier, tracking_number, tracking_url, updated_at
      FROM orders
      WHERE order_number = ${orderNumber} AND lower(email) = ${email}
      LIMIT 1
    `;
    if (!order) {
      const attemptedAt = Math.floor(Date.now() / 1000);
      await sql`
        INSERT INTO login_attempts(identity_hash, attempted_at)
        VALUES (${ipHash}, ${attemptedAt}), (${orderHash}, ${attemptedAt})
      `;
      return jsonResponse({ error: 'Nomor pesanan atau email tidak cocok.' }, 404);
    }

    const items = await sql`
      SELECT oi.id, oi.product_id, oi.title, oi.format, oi.unit_price, oi.quantity,
        review.status AS review_status
      FROM order_items AS oi
      LEFT JOIN product_reviews AS review ON review.order_item_id = oi.id
      WHERE oi.order_id = ${order.id}
      ORDER BY oi.id
    `;
    return jsonResponse({ order: { ...order, items } }, 200);
  } catch (error) {
    console.error('Order lookup failed.', error);
    return jsonResponse({ error: 'Status pesanan belum dapat dimuat.' }, 500);
  }
};

export const config = { path: '/api/order-lookup' };
