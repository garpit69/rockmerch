import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import health from '../netlify/functions/health.mjs';
import products from '../netlify/functions/products.mjs';

const originalDatabaseUrl = process.env.DATABASE_URL;

after(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('Netlify Functions configuration guards', () => {
  it('reports an unavailable health check when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;

    const response = await health();

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'not_configured' });
  });

  it('rejects non-GET catalog requests', async () => {
    process.env.DATABASE_URL = 'unused';

    const response = await products(new Request('https://example.test/api/products', {
      method: 'POST',
    }));

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.deepEqual(await response.json(), { error: 'Method not allowed.' });
  });

  it('reports an unconfigured database for catalog requests', async () => {
    delete process.env.DATABASE_URL;

    const response = await products(new Request('https://example.test/api/products'));

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Database is not configured.' });
  });
});
