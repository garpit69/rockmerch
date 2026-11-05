<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');

$error = '';
$message = '';
$token = (string)($_GET['token'] ?? $_POST['token'] ?? '');
$resetEmail = strtolower(trim((string)($_POST['email'] ?? '')));
$showCodeForm = false;
$validReset = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        verify_csrf();
        $action = (string)($_POST['action'] ?? '');

        if ($action === 'request') {
            $email = strtolower(trim((string)($_POST['email'] ?? '')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('Alamat email tidak valid.');
            }

            $resetEmail = $email;
            $showCodeForm = true;
            $userQuery = $db->prepare('SELECT id FROM users WHERE email=?');
            $userQuery->execute([$email]);
            $user = $userQuery->fetch();

            if ($user) {
                $now = time();
                $rate = $db->prepare('SELECT COUNT(*) FROM password_resets WHERE user_id=? AND requested_at>?');
                $rate->execute([(int)$user['id'], $now - 3600]);
                if ((int)$rate->fetchColumn() < 3) {
                    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                    $expires = $now + 900;

                    // A new request invalidates earlier codes for this account.
                    $invalidate = $db->prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL');
                    $invalidate->execute([$now, (int)$user['id']]);

                    $insert = $db->prepare('INSERT INTO password_resets (user_id,token_hash,expires_at,code_hash,attempts,requested_at) VALUES (?,?,?,?,0,?)');
                    $insert->execute([
                        (int)$user['id'],
                        hash('sha256', bin2hex(random_bytes(32))),
                        $expires,
                        password_hash($code, PASSWORD_DEFAULT),
                        $now,
                    ]);
                    $resetId = (int)$db->lastInsertId();

                    $company = str_replace(["\r", "\n", '"'], '', setting('company_name'));
                    $sender = trim(setting('email'));
                    $headers = "Content-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0";
                    if (filter_var($sender, FILTER_VALIDATE_EMAIL)) {
                        $headers = 'From: "' . $company . '" <' . $sender . ">\r\n" . $headers;
                    }
                    $subject = 'Kode verifikasi reset kata sandi - ' . $company;
                    $body = "Kode verifikasi reset kata sandi Anda: {$code}\n\nKode ini berlaku selama 15 menit dan hanya dapat digunakan sekali. Jika Anda tidak meminta reset kata sandi, abaikan email ini.";
                    if (!mail($email, $subject, $body, $headers)) {
                        $failed = $db->prepare('UPDATE password_resets SET used_at=? WHERE id=?');
                        $failed->execute([$now, $resetId]);
                        error_log('Password reset email delivery failed for account ID ' . (int)$user['id']);
                    }
                }
            }

            // Use the same response for known and unknown addresses.
            $message = 'Jika email terdaftar dan layanan email tersedia, kode verifikasi akan dikirim. Kode berlaku 15 menit.';
        } elseif ($action === 'verify') {
            $email = strtolower(trim((string)($_POST['email'] ?? '')));
            $resetEmail = $email;
            $showCodeForm = true;
            $code = trim((string)($_POST['code'] ?? ''));
            $password = (string)($_POST['password'] ?? '');
            $confirmPassword = (string)($_POST['confirm_password'] ?? '');

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('Alamat email tidak valid.');
            }
            if (!preg_match('/^\d{6}$/', $code)) {
                throw new RuntimeException('Kode verifikasi harus terdiri dari 6 angka.');
            }
            if (strlen($password) < 10) {
                throw new RuntimeException('Kata sandi baru minimal 10 karakter.');
            }
            if ($password !== $confirmPassword) {
                throw new RuntimeException('Konfirmasi kata sandi baru tidak cocok.');
            }

            $userQuery = $db->prepare('SELECT id FROM users WHERE email=?');
            $userQuery->execute([$email]);
            $user = $userQuery->fetch();
            if (!$user) {
                throw new RuntimeException('Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.');
            }

            $db->beginTransaction();
            try {
                $resetQuery = $db->prepare('SELECT id,code_hash,attempts FROM password_resets WHERE user_id=? AND code_hash IS NOT NULL AND expires_at>? AND used_at IS NULL ORDER BY id DESC LIMIT 1');
                $resetQuery->execute([(int)$user['id'], time()]);
                $reset = $resetQuery->fetch();
                if (!$reset || (int)$reset['attempts'] >= 5) {
                    $db->commit();
                    throw new RuntimeException('Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.');
                }

                if (!password_verify($code, (string)$reset['code_hash'])) {
                    $attempts = (int)$reset['attempts'] + 1;
                    $updateAttempt = $db->prepare('UPDATE password_resets SET attempts=?,used_at=CASE WHEN ?>=5 THEN ? ELSE used_at END WHERE id=?');
                    $updateAttempt->execute([$attempts, $attempts, time(), (int)$reset['id']]);
                    $db->commit();
                    throw new RuntimeException('Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.');
                }

                $updatePassword = $db->prepare('UPDATE users SET password=? WHERE id=?');
                $updatePassword->execute([password_hash($password, PASSWORD_DEFAULT), (int)$user['id']]);
                $consume = $db->prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL');
                $consume->execute([time(), (int)$user['id']]);
                $db->commit();
                $showCodeForm = false;
                $message = 'Kata sandi berhasil diperbarui. Silakan masuk kembali.';
            } catch (Throwable $exception) {
                if ($db->inTransaction()) $db->rollBack();
                throw $exception;
            }
        } elseif ($action === 'reset') {
            // Honor reset links issued before the email-code flow was deployed.
            $password = (string)($_POST['password'] ?? '');
            if (strlen($password) < 10) {
                throw new RuntimeException('Kata sandi baru minimal 10 karakter.');
            }
            $db->beginTransaction();
            $stmt = $db->prepare('SELECT id,user_id FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL ORDER BY id DESC LIMIT 1');
            $stmt->execute([hash('sha256', $token), time()]);
            $reset = $stmt->fetch();
            if (!$reset) {
                throw new RuntimeException('Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.');
            }
            $update = $db->prepare('UPDATE users SET password=? WHERE id=?');
            $update->execute([password_hash($password, PASSWORD_DEFAULT), (int)$reset['user_id']]);
            $used = $db->prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL');
            $used->execute([time(), (int)$reset['user_id']]);
            $db->commit();
            $message = 'Kata sandi berhasil diperbarui. Silakan masuk kembali.';
        }
    } catch (Throwable $exception) {
        if ($db->inTransaction()) $db->rollBack();
        $error = $exception->getMessage();
    }
}

if ($token !== '') {
    $stmt = $db->prepare('SELECT id FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL LIMIT 1');
    $stmt->execute([hash('sha256', $token), time()]);
    $validReset = (bool)$stmt->fetch();
}
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Atur ulang kata sandi — <?= h(setting('company_name')) ?></title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body class="admin-body">
<main class="login-wrap">
    <section class="login-card">
        <span class="eyebrow">PEMULIHAN AKUN</span>
        <h1><?= $validReset ? 'Buat kata sandi baru.' : ($showCodeForm ? 'Masukkan kode verifikasi.' : 'Lupa kata sandi?') ?></h1>
        <p><?= $validReset ? 'Pilih kata sandi baru minimal 10 karakter.' : ($showCodeForm ? 'Masukkan kode 6 digit yang dikirim ke email dan tentukan kata sandi baru.' : 'Masukkan email akun admin atau editor untuk menerima kode verifikasi.') ?></p>
        <?php if ($error): ?><div class="notice error"><?= h($error) ?></div><?php endif ?>
        <?php if ($message): ?><div class="notice success" aria-live="polite"><?= h($message) ?></div><?php endif ?>

        <?php if ($validReset): ?>
            <form method="post">
                <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                <input type="hidden" name="action" value="reset">
                <input type="hidden" name="token" value="<?= h($token) ?>">
                <label>Kata sandi baru<input type="password" name="password" minlength="10" required autocomplete="new-password"></label>
                <button class="button button-dark full-width">Simpan kata sandi</button>
            </form>
        <?php elseif ($showCodeForm): ?>
            <form method="post">
                <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                <input type="hidden" name="action" value="verify">
                <input type="hidden" name="email" value="<?= h($resetEmail) ?>">
                <label>Email akun<input type="email" value="<?= h($resetEmail) ?>" disabled></label>
                <label>Kode verifikasi<input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label>
                <label>Kata sandi baru<input type="password" name="password" minlength="10" required autocomplete="new-password"></label>
                <label>Konfirmasi kata sandi baru<input type="password" name="confirm_password" minlength="10" required autocomplete="new-password"></label>
                <button class="button button-dark full-width">Verifikasi dan simpan kata sandi</button>
            </form>
            <form method="post" class="password-reset-resend">
                <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                <input type="hidden" name="action" value="request">
                <input type="hidden" name="email" value="<?= h($resetEmail) ?>">
                <button type="submit" class="back-link">Kirim ulang kode</button>
            </form>
        <?php else: ?>
            <form method="post">
                <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
                <input type="hidden" name="action" value="request">
                <label>Email akun<input type="email" name="email" value="<?= h($resetEmail) ?>" required autocomplete="email"></label>
                <button class="button button-dark full-width">Kirim kode verifikasi</button>
            </form>
        <?php endif ?>
        <a class="back-link" href="admin.php">Kembali ke login</a>
    </section>
</main>
</body>
</html>
