import { neon } from '@neondatabase/serverless';
import {
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { jsonResponse, requireAdmin } from './admin-security.mjs';

const tables = [
  'settings',
  'products',
  'articles',
  'orders',
  'order_items',
  'product_reviews',
  'product_views',
  'search_terms',
  'admin_activity',
];

const backupSettingKeys = [
  'company_name',
  'tagline',
  'mission',
  'hero_video',
  'free_shipping',
  'shipping_fee',
  'manual_bank_accounts',
  'address',
  'email',
  'instagram',
  'tiktok',
  'playlist',
  'whatsapp_phone',
  'opening_hours',
  'company_story',
  'company_selection',
  'company_commitments',
];

export default async (request) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  }
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireAdmin(request, sql);
  if (!auth.user) return auth.response;

  try {
    const snapshot = await sql.transaction(tables.map((name) => (
      name === 'settings'
        ? sql.query('SELECT key, value FROM settings WHERE key = ANY($1::TEXT[])', [backupSettingKeys])
        : sql.query(`SELECT * FROM ${name}`)
    )));
    const data = Object.fromEntries(tables.map((name, index) => [name, snapshot[index]]));
    const backup = {
      format: 'rockmerch-netlify-backup',
      version: 1,
      created_at: new Date().toISOString(),
      includes_customer_order_data: true,
      tables: data,
    };
    await recordAdminActivity(sql, auth.user.email, 'backup_exported');
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(backup), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="rockmerch-backup-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AdminActivityWriteError) {
      return jsonResponse({ error: 'Backup belum diunduh karena riwayat ekspor gagal dicatat.' }, 500);
    }
    console.error('Admin data backup failed.', error);
    return jsonResponse({ error: 'Backup data toko belum dapat dibuat.' }, 500);
  }
};

export const config = { path: '/api/admin/backup' };
