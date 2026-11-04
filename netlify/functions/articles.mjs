import { neon } from '@neondatabase/serverless';

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

  const slug = new URL(request.url).searchParams.get('slug')?.trim() || '';
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return Response.json({ error: 'Article not found.' }, { status: 404 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    if (slug) {
      const [article] = await sql`
        SELECT id, title, slug, category, excerpt, content, image, publish_at, created_at
        FROM articles
        WHERE (
          (status = 'published' AND (publish_at IS NULL OR publish_at <= NOW()))
          OR (status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= NOW())
        )
          AND slug = ${slug}
        LIMIT 1
      `;
      return article
        ? Response.json({ article })
        : Response.json({ error: 'Article not found.' }, { status: 404 });
    }

    const articles = await sql`
      SELECT id, title, slug, category, excerpt, image, publish_at, created_at
      FROM articles
      WHERE (
        (status = 'published' AND (publish_at IS NULL OR publish_at <= NOW()))
        OR (status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= NOW())
      )
      ORDER BY COALESCE(publish_at, created_at) DESC, id DESC
      LIMIT 50
    `;
    return Response.json({ articles });
  } catch (error) {
    console.error('Published article query failed.', error);
    return Response.json({ error: 'Unable to load articles.' }, { status: 500 });
  }
};

export const config = { path: '/api/articles' };
