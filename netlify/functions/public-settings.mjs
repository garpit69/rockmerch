import { neon } from '@neondatabase/serverless';
import { storeSettingDefaults } from '../../lib/store-settings.mjs';

const publicKeys = Object.keys(storeSettingDefaults);

export default async (request) => {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT key, value
      FROM settings
      WHERE key = ANY(${publicKeys}::TEXT[])
    `;
    const settings = { ...storeSettingDefaults };
    for (const row of rows) settings[row.key] = row.value;

    const whatsappDigits = settings.whatsapp_phone.replace(/\D/g, '');
    return Response.json({
      settings,
      whatsapp_url: whatsappDigits
        ? `https://wa.me/${whatsappDigits}`
        : '',
    }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
  } catch (error) {
    console.error('Public store settings query failed.', error);
    return Response.json({ error: 'Unable to load store information.' }, { status: 500 });
  }
};

export const config = { path: '/api/public-settings' };
