import { neon } from '@neondatabase/serverless';

export default async (request) => {
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { Allow: 'GET' } },
    );
  }

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const products = await sql`
      SELECT id, title, artist, formats, images, badge, featured, merchandise
      FROM products
      WHERE status = 'published'
      ORDER BY featured DESC, created_at DESC
      LIMIT 8
    `;

    return Response.json({ products });
  } catch (error) {
    console.error('Published product query failed.', error);
    return Response.json({ error: 'Unable to load the catalog.' }, { status: 500 });
  }
};

export const config = { path: '/api/products' };
