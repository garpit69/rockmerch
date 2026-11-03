<?php
declare(strict_types=1);

function create_initial_admin(PDO $db, string $email): array {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Alamat email admin tidak valid.');
    }

    $db->exec('BEGIN IMMEDIATE');
    $transactionOpen = true;
    try {
        if ((int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 0) {
            throw new RuntimeException('Admin pertama sudah dibuat; setup hanya tersedia saat belum ada pengguna.');
        }

        $password = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        $stmt = $db->prepare('INSERT INTO users (email,password,role) VALUES (?,?,?)');
        $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), 'admin']);
        $db->exec('COMMIT');
        $transactionOpen = false;

        return ['email' => $email, 'password' => $password];
    } catch (Throwable $exception) {
        if ($transactionOpen) {
            $db->exec('ROLLBACK');
        }
        throw $exception;
    }
}
