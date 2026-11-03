import { neon } from '@neondatabase/serverless';

export default async () => {
  if (!process.env.DATABASE_URL) {
    return Response.json({ status: 'not_configured' }, { status: 503 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`SELECT 1`;
    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('Neon health check failed.', error);
    return Response.json({ status: 'unavailable' }, { status: 500 });
  }
};

export const config = { path: '/api/health' };
