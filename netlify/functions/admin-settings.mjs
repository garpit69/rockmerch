import { neon } from '@neondatabase/serverless';
import { getCheckoutConfig, getCheckoutConfigFromDatabase } from './checkout-config.mjs';
import { storeSettingDefaults } from '../../lib/store-settings.mjs';
import {
  activityWriteFailureMessage,
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { jsonResponse, originIsAllowed, requireAdmin } from './admin-security.mjs';

const editableKeys = new Set([
  'company_name', 'tagline', 'mission', 'hero_video', 'free_shipping', 'shipping_fee',
  'manual_bank_accounts', 'address', 'email', 'instagram', 'tiktok', 'playlist',
  'whatsapp_phone', 'opening_hours', 'company_story', 'company_selection',
  'company_commitments',
]);

const publicSettings = [...editableKeys];

const validateSettings = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Data pengaturan tidak valid.';
  for (const [key, value] of Object.entries(body)) {
    if (!editableKeys.has(key)) return `Pengaturan ${key} tidak dapat diubah dari panel ini.`;
    if (typeof value !== 'string') return `Pengaturan ${key} harus berupa teks.`;
    const limit = ['company_story', 'company_selection', 'company_commitments', 'mission'].includes(key)
      ? 4000
      : key === 'manual_bank_accounts' ? 4000 : 1000;
    if (value.length > limit) return `Pengaturan ${key} melebihi batas karakter.`;
  }
  if ('company_name' in body && !body.company_name.trim()) return 'Nama toko wajib diisi.';
  if ('email' in body && body.email.trim()
    && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.length > 254)) {
    return 'Format email toko tidak valid.';
  }
  if ('whatsapp_phone' in body && body.whatsapp_phone
    && !/^\+?[0-9 ()-]{8,24}$/.test(body.whatsapp_phone)) {
    return 'Nomor WhatsApp toko tidak valid.';
  }
  for (const key of ['shipping_fee', 'free_shipping']) {
    if (key in body && !/^\d{1,12}$/.test(body[key])) {
      return `Pengaturan ${key} harus berupa bilangan bulat non-negatif.`;
    }
  }
  if (body.hero_video && (!validUrl(body.hero_video, ['https:']))) {
    return 'Video hero harus menggunakan URL HTTPS.';
  }
  for (const key of ['instagram', 'tiktok', 'playlist']) {
    if (body[key] && !validUrl(body[key], ['https:', 'http:'])) {
      return `Tautan ${key} harus berupa URL HTTP atau HTTPS.`;
    }
  }
  if ('manual_bank_accounts' in body) {
    try {
      getCheckoutConfig({ BANK_ACCOUNTS_JSON: body.manual_bank_accounts });
    } catch {
      return 'Daftar rekening harus berupa JSON yang valid dengan kode BCA, Mandiri, BRI, atau BNI.';
    }
  }
  return null;
};

const validUrl = (value, protocols) => {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

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
      const rows = await sql`
        SELECT key, value
        FROM settings
        WHERE key = ANY(${publicSettings}::TEXT[])
      `;
      const checkoutConfig = await getCheckoutConfigFromDatabase(sql);
      const stored = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
      return jsonResponse({
        settings: {
          ...storeSettingDefaults,
          ...stored,
          manual_bank_accounts: JSON.stringify(checkoutConfig.banks.map(({ code, account, holder }) => (
            { code, account, holder }
          ))),
          shipping_fee: String(checkoutConfig.shippingFee),
          free_shipping: String(checkoutConfig.freeShippingThreshold),
        },
      });
    } catch (error) {
      console.error('Admin store settings query failed.', error);
      return jsonResponse({ error: 'Pengaturan toko tidak dapat dimuat.' }, 500);
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
  const validationError = validateSettings(body);
  if (validationError) return jsonResponse({ error: validationError }, 400);
  if (!Object.keys(body).length) return jsonResponse({ error: 'Pilih setidaknya satu pengaturan.' }, 400);

  try {
    await sql.transaction((transaction) => Object.entries(body).map(([key, value]) => transaction`
      INSERT INTO settings(key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `));
    await recordAdminActivity(sql, auth.user.email, 'store_settings_updated', JSON.stringify({
      updated_keys: Object.keys(body).sort(),
    }));
    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
    console.error('Admin store settings update failed.', error);
    return jsonResponse({ error: 'Pengaturan toko belum dapat disimpan.' }, 500);
  }
};

export const config = { path: '/api/admin/settings' };
