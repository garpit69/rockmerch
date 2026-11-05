<?php
declare(strict_types=1);

require __DIR__ . '/../lib/migrations.php';
require __DIR__ . '/../lib/order_notifications.php';
require __DIR__ . '/../lib/admin_setup.php';

function assert_same(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec("
    CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        subtotal INTEGER NOT NULL,
        shipping INTEGER NOT NULL,
        total INTEGER NOT NULL,
        shipping_carrier TEXT NOT NULL DEFAULT '',
        tracking_number TEXT NOT NULL DEFAULT '',
        tracking_url TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        format TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL
    );
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin'
    );
    CREATE TABLE password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
    );
");
$applied = apply_migrations($db, __DIR__ . '/../migrations');
assert_same(['001_legacy_baseline', '002_email_outbox', '003_transfer_bank_snapshot', '004_password_reset_email_code'], $applied, 'All new migrations should apply.');
assert_same([], apply_migrations($db, __DIR__ . '/../migrations'), 'Migrations should be idempotent.');
$resetColumns = array_column($db->query('PRAGMA table_info(password_resets)')->fetchAll(), 'name');
foreach (['code_hash', 'attempts', 'requested_at'] as $column) {
    assert_same(true, in_array($column, $resetColumns, true), 'Password reset schema should include ' . $column . '.');
}

$db->exec("INSERT INTO orders(id,order_number,customer_name,email,status,subtotal,shipping,total,shipping_carrier,tracking_number,tracking_url) VALUES(1,'RM-261102-ABCDEF0123456789ABCDEF0123456789','Test Customer','user@example.com','shipped',100000,10000,110000,'JNE','RESI123','https://tracking.example/resi')");
$db->exec("INSERT INTO order_items(id,order_id,title,format,quantity,unit_price) VALUES(1,1,'Album Uji','Vinyl',1,100000)");
$bankSnapshot = $db->query('SELECT transfer_bank_code,transfer_bank_account,transfer_account_name FROM orders WHERE id=1')->fetch();
assert_same(['transfer_bank_code' => '', 'transfer_bank_account' => '', 'transfer_account_name' => ''], $bankSnapshot, 'Existing orders should receive empty transfer snapshots.');

$adminCredentials = create_initial_admin($db, 'owner@example.com');
assert_same('owner@example.com', $adminCredentials['email'], 'The initial admin should use the supplied email.');
assert_same('admin', $db->query('SELECT role FROM users LIMIT 1')->fetchColumn(), 'The initial setup should create an admin role.');
assert_same(true, password_verify($adminCredentials['password'], $db->query('SELECT password FROM users LIMIT 1')->fetchColumn()), 'The generated initial password should match its stored hash.');
try {
    create_initial_admin($db, 'attacker@example.com');
    throw new RuntimeException('Initial setup should reject a second account.');
} catch (RuntimeException $exception) {
    assert_same('Admin pertama sudah dibuat; setup hanya tersedia saat belum ada pengguna.', $exception->getMessage(), 'Initial setup should close after the first account is created.');
}

function order_status(string $status): string {
    return $status === 'shipped' ? 'Dikirim' : $status;
}
function money(int|float $amount): string {
    return 'Rp' . number_format((float)$amount, 0, ',', '.');
}
function setting(string $key): string {
    return $key === 'company_name' ? 'Rock Merch' : '';
}
function safe_tracking_url(?string $url): string {
    return filter_var($url, FILTER_VALIDATE_URL) && strtolower((string)parse_url($url, PHP_URL_SCHEME)) === 'https' ? $url : '';
}

assert_same(true, queue_order_notification($db, 1, 'shipped'), 'The first shipment email should be queued.');
assert_same(false, queue_order_notification($db, 1, 'shipped'), 'Duplicate shipment notifications should be ignored.');
$email = $db->query('SELECT recipient,subject,body,status FROM email_outbox')->fetch();
assert_same('user@example.com', $email['recipient'], 'Notification recipient should match order email.');
assert_same('pending', $email['status'], 'New notifications should await delivery.');
if (!str_contains($email['body'], 'RESI123') || !str_contains($email['body'], 'https://tracking.example/resi')) {
    throw new RuntimeException('Shipment notification should include tracking details.');
}

echo "All tests passed.\n";
