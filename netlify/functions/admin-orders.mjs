import { neon } from '@neondatabase/serverless';
import {
  activityWriteFailureMessage,
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { jsonResponse, originIsAllowed, requireAdmin } from './admin-security.mjs';

const orderStatuses = new Set([
  'awaiting_payment',
  'awaiting_confirmation',
  'confirmed',
  'packing',
  'shipped',
  'completed',
  'cancelled',
]);

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
      const [orders, items] = await sql.transaction([
        sql`
          SELECT id, order_number, customer_name, email, phone, address,
            city, postal_code, notes, subtotal, shipping, total,
            payment_method, status, transfer_bank_code, transfer_bank_account,
            transfer_account_name, shipping_carrier, tracking_number,
            tracking_url, created_at, updated_at
          FROM orders
          ORDER BY created_at DESC, id DESC
          LIMIT 100
        `,
        sql`
          SELECT oi.order_id, oi.title, oi.format, oi.unit_price, oi.quantity
          FROM order_items AS oi
          JOIN orders AS o ON o.id = oi.order_id
          ORDER BY o.created_at DESC, oi.id ASC
          LIMIT 2000
        `,
      ]);
      const itemsByOrder = new Map();
      for (const item of items) {
        const orderItems = itemsByOrder.get(String(item.order_id)) || [];
        orderItems.push(item);
        itemsByOrder.set(String(item.order_id), orderItems);
      }
      return jsonResponse({
        orders: orders.map((order) => ({
          ...order,
          items: itemsByOrder.get(String(order.id)) || [],
        })),
      });
    } catch (error) {
      console.error('Admin order list failed.', error);
      return jsonResponse({ error: 'Pesanan tidak dapat dimuat.' }, 500);
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
  const status = body?.status;
  const carrier = body?.shipping_carrier || '';
  const trackingNumber = body?.tracking_number || '';
  const trackingUrl = body?.tracking_url || '';
  if (
    !Number.isSafeInteger(id) || id < 1
    || !orderStatuses.has(status)
    || typeof carrier !== 'string' || carrier.length > 80
    || typeof trackingNumber !== 'string' || trackingNumber.length > 120
    || typeof trackingUrl !== 'string' || trackingUrl.length > 1000
    || (trackingUrl && !/^https:\/\/[^\s]+$/i.test(trackingUrl))
  ) {
    return jsonResponse({ error: 'Pembaruan status atau pelacakan tidak valid.' }, 400);
  }

  try {
    const [result] = await sql`
      WITH updated AS MATERIALIZED (
        SELECT rockmerch_admin_update_order(
          ${id}, ${status}, ${carrier.trim()}, ${trackingNumber.trim()}, ${trackingUrl.trim()}
        ) AS order_data
      ),
      queued AS (
        INSERT INTO email_outbox(event_key, recipient, subject, body, available_at)
        SELECT
          'order-update:' || saved.id || ':' || md5(concat_ws(
            chr(10), saved.status, saved.shipping_carrier, saved.tracking_number, saved.tracking_url
          )),
          saved.email,
          'Pesanan ' || saved.order_number || ' diperbarui - RockMerch',
          concat(
            'Halo ', saved.customer_name, ',', chr(10), chr(10),
            'Status pesanan ', saved.order_number, ' sekarang: ',
              CASE saved.status
                WHEN 'awaiting_confirmation' THEN 'menunggu konfirmasi pembayaran'
                WHEN 'confirmed' THEN 'pembayaran dikonfirmasi'
                WHEN 'packing' THEN 'sedang dikemas'
                WHEN 'shipped' THEN 'dikirim'
                WHEN 'completed' THEN 'selesai'
                WHEN 'cancelled' THEN 'dibatalkan'
                ELSE 'menunggu pembayaran'
              END,
            CASE WHEN saved.shipping_carrier <> '' THEN chr(10) || 'Kurir: ' || saved.shipping_carrier ELSE '' END,
            CASE WHEN saved.tracking_number <> '' THEN chr(10) || 'Nomor resi: ' || saved.tracking_number ELSE '' END,
            CASE WHEN saved.tracking_url <> '' THEN chr(10) || 'Pelacakan: ' || saved.tracking_url ELSE '' END
          ),
          FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT
        FROM updated
        JOIN orders AS saved ON saved.id = (updated.order_data->>'id')::BIGINT
        WHERE saved.status <> 'awaiting_payment'
          OR saved.shipping_carrier <> ''
          OR saved.tracking_number <> ''
          OR saved.tracking_url <> ''
        ON CONFLICT (event_key) DO NOTHING
        RETURNING id
      )
      SELECT updated.order_data AS order_data, (SELECT COUNT(*) FROM queued) AS email_queued
      FROM updated
    `;
    await recordAdminActivity(sql, auth.user.email, 'order_status_changed', JSON.stringify({
      order_id: id,
      status: result.order_data.status,
    }));
    return jsonResponse({ order: result.order_data });
  } catch (error) {
    if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
    if (error.code === 'R0002') return jsonResponse({ error: 'Pesanan tidak ditemukan.' }, 404);
    if (['R0001', 'R0003'].includes(error.code)) {
      return jsonResponse({ error: 'Pembaruan pesanan tidak dapat diterapkan.' }, 409);
    }
    console.error('Admin order update failed.', error);
    return jsonResponse({ error: 'Pesanan belum dapat diperbarui.' }, 500);
  }
};

export const config = { path: '/api/admin/orders' };
