import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import adminAuth from '../netlify/functions/admin-auth.mjs';
import adminActivity from '../netlify/functions/admin-activity.mjs';
import adminAnalytics from '../netlify/functions/admin-analytics.mjs';
import adminArticles from '../netlify/functions/admin-articles.mjs';
import adminBackup from '../netlify/functions/admin-backup.mjs';
import adminOrders from '../netlify/functions/admin-orders.mjs';
import adminOverview from '../netlify/functions/admin-overview.mjs';
import adminProducts from '../netlify/functions/admin-products.mjs';
import adminReviews from '../netlify/functions/admin-reviews.mjs';
import adminSettings from '../netlify/functions/admin-settings.mjs';
import adminUsers from '../netlify/functions/admin-users.mjs';
import { originIsAllowed, readCookie } from '../netlify/functions/admin-security.mjs';
import checkoutConfig, { getCheckoutConfig } from '../netlify/functions/checkout-config.mjs';
import health from '../netlify/functions/health.mjs';
import orders from '../netlify/functions/orders.mjs';
import products from '../netlify/functions/products.mjs';
import { hashPassword, verifyPassword } from '../lib/passwords.mjs';
import { getAllowedOrderStatuses } from '../lib/order-statuses.mjs';
import articles from '../netlify/functions/articles.mjs';
import engagement from '../netlify/functions/engagement.mjs';
import emailWorker from '../netlify/functions/email-worker.mjs';
import orderLookup from '../netlify/functions/order-lookup.mjs';
import passwordReset from '../netlify/functions/password-reset.mjs';
import publicSettings from '../netlify/functions/public-settings.mjs';
import reviews from '../netlify/functions/reviews.mjs';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBankAccounts = process.env.BANK_ACCOUNTS_JSON;
const originalShippingFee = process.env.SHIPPING_FEE;
const originalFreeShippingThreshold = process.env.FREE_SHIPPING_THRESHOLD;
const originalResendApiKey = process.env.RESEND_API_KEY;
const originalEmailFrom = process.env.EMAIL_FROM;

after(() => {
  restoreEnvironment('DATABASE_URL', originalDatabaseUrl);
  restoreEnvironment('BANK_ACCOUNTS_JSON', originalBankAccounts);
  restoreEnvironment('SHIPPING_FEE', originalShippingFee);
  restoreEnvironment('FREE_SHIPPING_THRESHOLD', originalFreeShippingThreshold);
  restoreEnvironment('RESEND_API_KEY', originalResendApiKey);
  restoreEnvironment('EMAIL_FROM', originalEmailFrom);
});

const restoreEnvironment = (name, value) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

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

  it('only serves admin activity history through GET', async () => {
    const response = await adminActivity(new Request('https://example.test/api/admin/activity', {
      method: 'POST',
    }));

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  });

  it('requires a database for admin activity history', async () => {
    delete process.env.DATABASE_URL;

    const response = await adminActivity(new Request('https://example.test/api/admin/activity'));

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Database is not configured.' });
  });

  it('reports an unconfigured database for catalog requests', async () => {
    delete process.env.DATABASE_URL;

    const response = await products(new Request('https://example.test/api/products'));

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Database is not configured.' });
  });

  it('only serves published articles through GET', async () => {
    const response = await articles(new Request('https://example.test/api/articles', {
      method: 'POST',
    }));

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  });

  it('requires a database for public store information', async () => {
    delete process.env.DATABASE_URL;

    const response = await publicSettings(new Request('https://example.test/api/public-settings'));

    assert.equal(response.status, 503);
  });

  it('requires a database for order lookup and customer reviews', async () => {
    delete process.env.DATABASE_URL;

    const lookupResponse = await orderLookup(new Request('https://example.test/api/order-lookup', {
      method: 'POST',
    }));
    const reviewResponse = await reviews(new Request('https://example.test/api/reviews'));

    assert.equal(lookupResponse.status, 503);
    assert.equal(reviewResponse.status, 503);
  });

  it('rejects invalid order lookup and review requests before database access', async () => {
    process.env.DATABASE_URL = 'unused';
    const lookupResponse = await orderLookup(new Request('https://example.test/api/order-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_number: 'not-an-order', email: 'not-an-email' }),
    }));
    const reviewResponse = await reviews(new Request('https://example.test/api/reviews', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example',
        'Content-Type': 'application/json',
      },
      body: '{}',
    }));

    assert.equal(lookupResponse.status, 400);
    assert.equal(reviewResponse.status, 403);
  });

  it('only accepts POST for engagement telemetry', async () => {
    const response = await engagement(new Request('https://example.test/api/engagement'));

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });

  it('uses the existing storefront shipping defaults without exposing accounts', () => {
    delete process.env.BANK_ACCOUNTS_JSON;
    delete process.env.SHIPPING_FEE;
    delete process.env.FREE_SHIPPING_THRESHOLD;

    assert.deepEqual(getCheckoutConfig(), {
      shippingFee: 15000,
      freeShippingThreshold: 250000,
      banks: [],
    });
  });

  describe('Admin API guards and password hashing', () => {
    it('uses a salted password hash and verifies without plaintext storage', async () => {
      const hash = await hashPassword('a long test-only admin password');

      assert.match(hash, /^scrypt\$32768\$8\$1\$/);
      assert.notEqual(hash, 'a long test-only admin password');
      assert.equal(await verifyPassword('a long test-only admin password', hash), true);
      assert.equal(await verifyPassword('wrong password', hash), false);
    });

    it('rejects unsupported admin authentication methods', async () => {
      const response = await adminAuth(new Request('https://example.test/api/admin/auth', {
        method: 'PUT',
      }));

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, POST, DELETE');
    });

    it('rejects unsupported admin product methods', async () => {
      const response = await adminProducts(new Request('https://example.test/api/admin/products', {
        method: 'DELETE',
      }));

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, POST, PATCH');
    });

    it('rejects unsupported admin order methods', async () => {
      const response = await adminOrders(new Request('https://example.test/api/admin/orders', {
        method: 'POST',
      }));

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, PATCH');
    });

    it('rejects unsupported methods across admin content and account APIs', async () => {
      const responses = await Promise.all([
        adminArticles(new Request('https://example.test/api/admin/articles', { method: 'PUT' })),
        adminReviews(new Request('https://example.test/api/admin/reviews', { method: 'POST' })),
        adminSettings(new Request('https://example.test/api/admin/settings', { method: 'POST' })),
        adminUsers(new Request('https://example.test/api/admin/users', { method: 'PUT' })),
        adminOverview(new Request('https://example.test/api/admin/overview', { method: 'POST' })),
        adminAnalytics(new Request('https://example.test/api/admin/analytics', { method: 'POST' })),
        adminBackup(new Request('https://example.test/api/admin/backup', { method: 'POST' })),
      ]);

      assert.deepEqual(responses.map((response) => response.status), [405, 405, 405, 405, 405, 405, 405]);
    });

    it('requires a valid same-origin request and database for password recovery', async () => {
      const invalidOrigin = await passwordReset(new Request('https://example.test/api/admin/password-reset', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example' },
      }));
      assert.equal(invalidOrigin.status, 403);

      process.env.DATABASE_URL = 'unused';
      const invalidEmail = await passwordReset(new Request('https://example.test/api/admin/password-reset', {
        method: 'POST',
        headers: {
          Origin: 'https://example.test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'request', email: 'not-an-email' }),
      }));
      assert.equal(invalidEmail.status, 400);

      delete process.env.DATABASE_URL;
      const response = await passwordReset(new Request('https://example.test/api/admin/password-reset', {
        method: 'POST',
        headers: {
          Origin: 'https://example.test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'request', email: 'admin@example.test' }),
      }));
      assert.equal(response.status, 503);
    });

    it('does not run the email worker without database or Resend configuration', async () => {
      delete process.env.DATABASE_URL;
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;

      const response = await emailWorker();

      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'Database is not configured.' });
    });

    it('accepts same-origin admin requests and rejects cross-origin requests', () => {
      assert.equal(originIsAllowed(new Request('https://shop.example/api/admin/auth', {
        method: 'POST',
        headers: { Origin: 'https://shop.example' },
      })), true);
      assert.equal(originIsAllowed(new Request('https://shop.example/api/admin/auth', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example' },
      })), false);
      assert.equal(originIsAllowed(new Request('https://shop.example/api/admin/auth', {
        method: 'POST',
      })), false);
    });

    it('reads the admin cookie without accepting a neighboring cookie name', () => {
      const request = new Request('https://shop.example/api/admin/auth', {
        headers: { Cookie: 'other=abc; rm_admin_session=token-value; rm_admin_session_extra=bad' },
      });

      assert.equal(readCookie(request, 'rm_admin_session'), 'token-value');
    });

    it('only offers forward order transitions and keeps terminal states closed', () => {
      assert.deepEqual(getAllowedOrderStatuses('awaiting_payment'), [
        'awaiting_payment',
        'awaiting_confirmation',
        'confirmed',
        'cancelled',
      ]);
      assert.deepEqual(getAllowedOrderStatuses('shipped'), ['shipped', 'completed']);
      assert.deepEqual(getAllowedOrderStatuses('completed'), ['completed']);
      assert.deepEqual(getAllowedOrderStatuses('cancelled'), ['cancelled']);
    });
  });

  it('rejects invalid bank account environment configuration', () => {
    process.env.BANK_ACCOUNTS_JSON = '{invalid';

    assert.throws(() => getCheckoutConfig(), /valid JSON/);
  });

  it('only serves checkout configuration through GET', async () => {
    const response = await checkoutConfig(new Request('https://example.test/api/checkout-config', {
      method: 'POST',
    }));

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  });

  it('requires JSON checkout requests', async () => {
    process.env.DATABASE_URL = 'unused';
    process.env.BANK_ACCOUNTS_JSON = JSON.stringify([
      { code: 'bca', account: '1234567890', holder: 'RockMerch' },
    ]);

    const response = await orders(new Request('https://example.test/api/orders', {
      method: 'POST',
      body: '{}',
    }));

    assert.equal(response.status, 415);
  });

  it('rejects invalid checkout payloads before database access', async () => {
    process.env.DATABASE_URL = 'unused';
    process.env.BANK_ACCOUNTS_JSON = JSON.stringify([
      { code: 'bca', account: '1234567890', holder: 'RockMerch' },
    ]);

    const response = await orders(new Request('https://example.test/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Lengkapi semua kolom wajib untuk pengiriman.',
    });
  });
});
