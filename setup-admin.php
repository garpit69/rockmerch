<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

if ($argc !== 2) {
    fwrite(STDERR, "Pemakaian: php setup-admin.php email-admin@example.com\n");
    exit(64);
}

$email = filter_var(strtolower(trim($argv[1])), FILTER_VALIDATE_EMAIL);
if ($email === false) {
    fwrite(STDERR, "Alamat email admin tidak valid.\n");
    exit(64);
}

require __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/admin_setup.php';

try {
    $credentials = create_initial_admin($db, $email);
    echo "Admin pertama berhasil dibuat.\n";
    echo "Email: {$credentials['email']}\n";
    echo "Kata sandi sementara: {$credentials['password']}\n";
    echo "Simpan kata sandi ini dengan aman. Ganti setelah login pertama.\n";
} catch (Throwable $exception) {
    fwrite(STDERR, 'Gagal membuat admin: ' . $exception->getMessage() . "\n");
    exit(1);
}
