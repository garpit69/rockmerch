import { neon } from '@neondatabase/serverless';
import { getCheckoutConfigFromDatabase } from './checkout-config.mjs';

const jsonResponse = (body, status) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const validateCheckout = (body, banks) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Checkout data is invalid.';
  }

  const requiredFields = ['customer_name', 'email', 'phone', 'address', 'city', 'postal_code'];
  for (const field of requiredFields) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      return 'Lengkapi semua kolom wajib untuk pengiriman.';
    }
  }

  const limits = {
    customer_name: 160,
    email: 254,
    phone: 40,
    address: 1000,
    city: 120,
    postal_code: 20,
    notes: 1000,
  };
  for (const [field, limit] of Object.entries(limits)) {
    if (body[field] !== undefined && (
      typeof body[field] !== 'string' || body[field].trim().length > limit
    )) {
      return `Kolom ${field} melebihi panjang maksimum.`;
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return 'Format email tidak valid.';
  }
  if (!/^[0-9+().\-\s]{8,40}$/.test(body.phone.trim())) {
    return 'Format nomor telepon tidak valid.';
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(body.idempotency_key || '')) {
    return 'Kunci checkout tidak valid. Muat ulang halaman dan coba lagi.';
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return 'Keranjang kosong atau jumlah item tidak valid.';
  }

  const seenItems = new Set();
  for (const item of body.items) {
    const productId = String(item?.product_id ?? '');
    if (!/^[1-9]\d{0,17}$/.test(productId)
      || typeof item.format !== 'string'
      || !item.format.trim()
      || item.format.length > 80
      || !Number.isInteger(item.quantity)
      || item.quantity < 1
      || item.quantity > 10) {
      return 'Item keranjang tidak valid.';
    }
    const itemKey = `${productId}|${item.format}`;
    if (seenItems.has(itemKey)) return 'Item keranjang duplikat.';
    seenItems.add(itemKey);
  }

  if (banks && (typeof body.bank_code !== 'string'
    || !banks.some((bank) => bank.code === body.bank_code))) {
    return banks.length
      ? 'Pilih rekening bank yang aktif.'
      : 'Transfer bank belum dikonfigurasi oleh toko.';
  }
  return null;
};

export default async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  if (!process.env.DATABASE_URL) {
    return jsonResponse({ error: 'Database is not configured.' }, 503);
  }

  let body;
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 32_000) {
      return jsonResponse({ error: 'Checkout request is too large.' }, 413);
    }
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
    }
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }

  const validationError = validateCheckout(body, null);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const sql = neon(process.env.DATABASE_URL);
  let checkoutConfig;
  try {
    checkoutConfig = await getCheckoutConfigFromDatabase(sql);
  } catch (error) {
    console.error('Checkout configuration is invalid.', error);
    return jsonResponse({ error: 'Checkout is not configured correctly.' }, 500);
  }
  const bankValidationError = validateCheckout(body, checkoutConfig.banks);
  if (bankValidationError) return jsonResponse({ error: bankValidationError }, 400);

  const bank = checkoutConfig.banks.find((item) => item.code === body.bank_code);
  const payload = {
    customer_name: body.customer_name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone.trim(),
    address: body.address.trim(),
    city: body.city.trim(),
    postal_code: body.postal_code.trim(),
    notes: (body.notes || '').trim(),
    idempotency_key: body.idempotency_key,
    bank_code: bank.code,
    bank_account: bank.account,
    account_name: bank.holder,
    shipping_fee: checkoutConfig.shippingFee,
    free_shipping_threshold: checkoutConfig.freeShippingThreshold,
    items: body.items.map((item) => ({
      product_id: String(item.product_id),
      format: item.format.trim(),
      quantity: item.quantity,
    })),
  };

  try {
    const [result] = await sql`
      WITH created AS MATERIALIZED (
        SELECT rockmerch_create_order(${JSON.stringify(payload)}::jsonb) AS order_data
      ),
      queued AS (
        INSERT INTO email_outbox(event_key, recipient, subject, body, available_at)
        SELECT
          'order-created:' || saved.id,
          saved.email,
          'Pesanan ' || saved.order_number || ' diterima - RockMerch',
          concat(
            'Halo ', saved.customer_name, ',', chr(10), chr(10),
            'Pesanan ', saved.order_number, ' berhasil dibuat.', chr(10),
            'Total pembayaran: Rp ',
              replace(to_char(saved.total, 'FM999,999,999,999,999,999,999'), ',', '.'), chr(10),
            'Transfer ke ', upper(saved.transfer_bank_code), ' ',
              saved.transfer_bank_account, ' a.n. ', saved.transfer_account_name, '.', chr(10),
            'Setelah transfer, konfirmasikan pembayaran melalui halaman pelacakan pesanan.'
          ),
          FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT
        FROM created
        JOIN orders AS saved ON saved.order_number = created.order_data->>'order_number'
        ON CONFLICT (event_key) DO NOTHING
        RETURNING id
      )
      SELECT created.order_data AS order_data, (SELECT COUNT(*) FROM queued) AS email_queued
      FROM created
    `;
    return jsonResponse({ order: result.order_data }, 201);
  } catch (error) {
    if (['R0001', 'R0002'].includes(error.code)) {
      return jsonResponse(
        { error: error.code === 'R0002'
          ? 'Salah satu rilisan atau stoknya sudah tidak tersedia. Perbarui keranjang.'
          : 'Data checkout tidak valid.' },
        error.code === 'R0002' ? 409 : 400,
      );
    }
    console.error('Order creation failed.', error);
    return jsonResponse({ error: 'Pesanan belum dapat dibuat. Coba lagi nanti.' }, 500);
  }
};

export const config = { path: '/api/orders' };
