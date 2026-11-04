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
      SELECT
        id, title, artist, formats, images, badge, featured, merchandise,
        genre, year, label, condition_name, description, tracklist,
        audio_url, energy, mood, nostalgia, keywords, created_at,
        COALESCE(review_summary.review_count, 0)::INTEGER AS review_count,
        review_summary.average_rating
      FROM products
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS review_count, ROUND(AVG(rating), 1) AS average_rating
        FROM product_reviews
        WHERE product_id = products.id AND status = 'published'
      ) AS review_summary ON TRUE
      WHERE products.status = 'published'
      ORDER BY products.featured DESC, products.created_at DESC
    `;

    return Response.json({ products });
  } catch (error) {
    console.error('Published product query failed.', error);
    return Response.json({ error: 'Unable to load the catalog.' }, { status: 500 });
  }
};

export const config = { path: '/api/products' };
