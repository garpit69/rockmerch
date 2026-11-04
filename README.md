# Rock Merch

## Company profile PDF

Open `company.php` and choose **Unduh Compfile (PDF)**. On the profile page,
choose **Unduh Compfile (PDF)** again, then select **Save as PDF** in the
browser's print dialog. The profile uses the store's configured identity and
catalog; it is rendered by the browser rather than downloaded as a prebuilt PDF.

## Install on desktop and mobile

The site can be installed as a Progressive Web App (PWA) from a supported
browser. Open `install.php` for platform-specific steps, or use the browser's
install option when it is offered. Public deployments must use HTTPS for
service-worker installation; localhost is supported for development.

The PWA caches static assets and an offline fallback only. The catalog,
checkout, account, and other live store features still require the site and its
backend to be reachable. This does not create native APK, EXE, or macOS app
installers.

## Hosting requirements

This project uses PHP, PDO SQLite, and a writable local SQLite database. Deploy
it to a host that supports PHP and persistent writable storage. Netlify and
Vercel do not run this PHP/SQLite application as-is; using either requires a
backend and database migration first. Do not upload the local SQLite database
or customer/order data as part of a static-site deployment.

## Netlify migration branch

The `migration/netlify` branch contains the Vite/React storefront and Netlify
Functions. It includes the public company and policy pages, articles, PWA shell,
manual bank-transfer checkout, order tracking and reviews, and role-based admin
tools for products, orders, articles, settings, reviews, staff, analytics,
activity history, and data export. Order and password-reset emails use a
Resend-backed outbox.

This is a staging/preview migration, not a production cutover. COD, Midtrans,
and file uploads are intentionally not enabled. Article images must use HTTPS;
product images may also reference existing same-site static assets. Do not copy
production customer or order data to Neon staging.

The current Neon staging catalog contains the 20 published product records
from the legacy catalog only; customer, order, and account data were not copied.
Their existing local cover images are served as static files from
`web/public/uploads`—this does not enable dynamic file uploads. Verify prices
and stock against the live inventory before any production launch.

To run this branch locally:

1. Install Node.js, then run `npm install` from the project root.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the Neon **staging**
   connection string. Never commit `.env` or paste the connection string into
   chat.
3. Apply `database/001_initial_schema.sql`, then migrations
   `002_commerce.sql` through `007_resend_email.sql` in numeric order to the
   staging database using the Neon SQL Editor. Apply each file once, in order.
   Do not run them against production or import the local SQLite database.
4. Configure `BANK_ACCOUNTS_JSON` in `.env` with the shop's payment account
   details before testing checkout. Use a JSON array, for example:

   ```json
   [{"code":"bca","account":"NOMOR_REKENING","holder":"NAMA_PEMILIK"}]
   ```

   The supported codes are `bca`, `mandiri`, `bri`, and `bni`. Set
   `SHIPPING_FEE` and `FREE_SHIPPING_THRESHOLD` if the defaults (15000 and
   250000 IDR) do not match store policy. Configure the same values as Netlify
   environment variables for a deploy preview; keep `.env` local and private.
5. To enable transactional email, configure `RESEND_API_KEY` and
   `EMAIL_FROM` locally and in Netlify's deploy-preview environment. Verify
   the sender domain with Resend first. Never commit or share the API key.
   The scheduled worker retries delivery with exponential backoff and stops
   after five attempts. Scheduled functions do not run automatically on deploy
   previews; use Netlify's Functions page to run `email-worker` manually while
   testing.
6. Run `npm run dev` and open `http://localhost:8888`. This builds the
   frontend first, then serves it alongside the local Netlify Functions. Check
   `http://localhost:8888/api/health` for the database connection.
7. Create the first Netlify-migration admin account in an interactive terminal
   with `npm run admin:create`; the password is hidden while entered. Do not
   reuse a production password.
8. Run `npm test` and `npm run build` to verify the functions and deployable
   frontend bundle.

For a Netlify deploy preview, connect the `migration/netlify` branch and set
`DATABASE_URL`, `BANK_ACCOUNTS_JSON`, `SHIPPING_FEE`,
`FREE_SHIPPING_THRESHOLD`, `RESEND_API_KEY`, and `EMAIL_FROM` in the
deploy-preview environment only. Keep the production environment untouched.
Verify the preview using staging data before considering a production
migration. Review email outbox failures in Netlify function logs and the
`email_outbox` table; never include private customer data in shared logs.

## Legacy PHP admin setup

The following command is for the existing PHP/SQLite application, not for the
Netlify migration branch. Its first admin account can only be created from the
server terminal. From the project directory, run:

```powershell
php setup-admin.php admin@example.com
```

The command creates a random temporary password and prints it once. Store it
securely, sign in at `admin.php`, and change the password after signing in. The
command refuses to run after any user account exists, and the web login page
does not offer public first-admin registration.

## Database migrations

The original SQLite schema is still initialized idempotently by `bootstrap.php`.
Versioned changes are stored in `migrations/` and tracked in `schema_migrations`;
the application applies unapplied migrations during startup. To inspect the applied
versions from the project directory, run:

```powershell
php migrate.php
```

Add future schema changes as a new, lexically ordered PHP migration returning a
callable that accepts a `PDO` connection. Migrations run in a transaction and are
recorded only after a successful upgrade. Back up `storage/rockmerch.sqlite`
before deploying schema changes.

## Order email notifications

Order receipt, payment confirmation, shipment, completion, and cancellation
messages are queued in SQLite. They are not sent from a customer request.
Configure PHP's `mail()` transport and the store sender address (`email` setting)
on the server, then schedule this command to run every minute:

```powershell
php email-worker.php
```

On Windows, run it with Task Scheduler using the full path to `php.exe` and
`email-worker.php`. The worker retries temporary failures with backoff up to five
times. Check the PHP error log and `email_outbox` for delivery failures. A
successful `mail()` call means the configured mail transport accepted a message,
not that the recipient's provider delivered it.

## Automated checks

Run the standalone test suite with:

```powershell
php tests/run.php
```

Tests use an in-memory SQLite database and do not modify the store database.
