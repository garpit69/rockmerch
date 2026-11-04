import { neon } from '@neondatabase/serverless';

const supportedBanks = new Set(['bca', 'mandiri', 'bri', 'bni']);

const readAmount = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback;
  if (!/^\d{1,12}$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return Number(value);
};

export const getCheckoutConfig = (environment = process.env) => {
  let banks = [];
  if (environment.BANK_ACCOUNTS_JSON) {
    let configuredBanks;
    try {
      configuredBanks = JSON.parse(environment.BANK_ACCOUNTS_JSON);
    } catch (error) {
      throw new Error('BANK_ACCOUNTS_JSON must contain valid JSON.', { cause: error });
    }
    if (!Array.isArray(configuredBanks)) {
      throw new Error('BANK_ACCOUNTS_JSON must be a JSON array.');
    }
    const seenCodes = new Set();
    banks = configuredBanks.map((bank) => {
      if (
        !bank
        || !supportedBanks.has(bank.code)
        || seenCodes.has(bank.code)
        || typeof bank.account !== 'string'
        || !bank.account.trim()
        || bank.account.length > 80
        || typeof bank.holder !== 'string'
        || !bank.holder.trim()
        || bank.holder.length > 160
      ) {
        throw new Error('BANK_ACCOUNTS_JSON contains an invalid or duplicate bank account.');
      }
      seenCodes.add(bank.code);
      return {
        code: bank.code,
        name: ({ bca: 'BCA', mandiri: 'Mandiri', bri: 'BRI', bni: 'BNI' })[bank.code],
        account: bank.account.trim(),
        holder: bank.holder.trim(),
      };
    });
  }

  return {
    shippingFee: readAmount(environment.SHIPPING_FEE, 15000, 'SHIPPING_FEE'),
    freeShippingThreshold: readAmount(
      environment.FREE_SHIPPING_THRESHOLD,
      250000,
      'FREE_SHIPPING_THRESHOLD',
    ),
    banks,
  };
};

export const getCheckoutConfigFromDatabase = async (sql) => {
  const rows = await sql`
    SELECT key, value
    FROM settings
    WHERE key = ANY(${['manual_bank_accounts', 'shipping_fee', 'free_shipping']}::TEXT[])
  `;
  const settings = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  return getCheckoutConfig({
    ...process.env,
    BANK_ACCOUNTS_JSON: settings.manual_bank_accounts || process.env.BANK_ACCOUNTS_JSON,
    SHIPPING_FEE: settings.shipping_fee ?? process.env.SHIPPING_FEE,
    FREE_SHIPPING_THRESHOLD: settings.free_shipping ?? process.env.FREE_SHIPPING_THRESHOLD,
  });
};

export default async (request) => {
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { Allow: 'GET' } },
    );
  }

  if (!process.env.DATABASE_URL) {
    try {
      return Response.json(getCheckoutConfig());
    } catch (error) {
      console.error('Checkout configuration is invalid.', error);
      return Response.json({ error: 'Checkout is not configured correctly.' }, { status: 500 });
    }
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    return Response.json(await getCheckoutConfigFromDatabase(sql));
  } catch (error) {
    console.error('Checkout configuration is invalid.', error);
    return Response.json({ error: 'Checkout is not configured correctly.' }, { status: 500 });
  }
};

export const config = { path: '/api/checkout-config' };
