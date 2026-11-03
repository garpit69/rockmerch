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

The `migration/netlify` branch contains the initial Vite/React and Netlify
Functions scaffold. The current preview only includes the storefront shell, a
read-only published-product endpoint, and a database health endpoint. It is
not a replacement for the PHP storefront yet; admin, checkout, orders,
payments, media uploads, and email still need to be migrated and tested.

To run this branch locally:

1. Install Node.js, then run `npm install` from the project root.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the Neon **staging**
   connection string. Never commit `.env` or paste the connection string into
   chat.
3. Apply `database/001_initial_schema.sql` to the empty staging database using
   the Neon SQL Editor. Do not run it against production or import the local
   SQLite database at this stage.
4. Run `npm run dev` and open `http://localhost:8888`. This builds the
   frontend first, then serves it alongside the local Netlify Functions. Check
   `http://localhost:8888/api/health` for the database connection.
5. Run `npm run build` to verify the deployable frontend bundle.

Netlify deployment should wait until the remaining features are ported and the
staging version passes end-to-end testing.

## Initial admin setup

The first admin account can only be created from the server terminal. From the
project directory, run:

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
