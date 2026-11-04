import { neon } from '@neondatabase/serverless';

export default async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Database is not configured.' }, { status: 503 });
  }
  if (request.headers.get('origin')) {
    try {
      if (new URL(request.headers.get('origin')).origin !== new URL(request.url).origin) {
        return Response.json({ error: 'Origin is not allowed.' }, { status: 403 });
      }
    } catch {
      return Response.json({ error: 'Origin is not allowed.' }, { status: 403 });
    }
  }

  let body;
  try {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return Response.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    }
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    if (body?.type === 'view' && /^[1-9]\d{0,17}$/.test(String(body.product_id || ''))) {
      await sql`
        INSERT INTO product_views(product_id, viewed_at)
        SELECT id, ${Math.floor(Date.now() / 1000)}
        FROM products
        WHERE id = ${String(body.product_id)} AND status = 'published'
      `;
    } else if (body?.type === 'search' && typeof body.term === 'string') {
      const term = body.term.trim().replace(/\s+/g, ' ').slice(0, 120);
      if (term.length < 2) return Response.json({ success: true });
      await sql`INSERT INTO search_terms(term, searched_at) VALUES (${term}, ${Math.floor(Date.now() / 1000)})`;
    } else {
      return Response.json({ error: 'Engagement event is invalid.' }, { status: 400 });
    }
    return Response.json({ success: true }, { status: 202 });
  } catch (error) {
    console.error('Storefront engagement event failed.', error);
    return Response.json({ error: 'Engagement event could not be recorded.' }, { status: 500 });
  }
};

export const config = { path: '/api/engagement' };
