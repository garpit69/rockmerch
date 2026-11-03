<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');
$error='';
$message='';
$token=(string)($_GET['token']??$_POST['token']??'');
if($_SERVER['REQUEST_METHOD']==='POST') {
    try {
        verify_csrf();
        if(($_POST['action']??'')==='request') {
            $email=strtolower(trim((string)($_POST['email']??'')));
            if(filter_var($email,FILTER_VALIDATE_EMAIL)) {
                $stmt=$db->prepare('SELECT id FROM users WHERE email=?');$stmt->execute([$email]);$user=$stmt->fetch();
                if($user) {
                    $rate=$db->prepare('SELECT COUNT(*) FROM password_resets WHERE user_id=? AND expires_at>?');
                    $rate->execute([$user['id'],time()]);
                    if((int)$rate->fetchColumn()<3) {
                        $token=bin2hex(random_bytes(32));$expires=time()+1800;
                        $insert=$db->prepare('INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,?)');
                        $insert->execute([$user['id'],hash('sha256',$token),$expires]);
                        $scheme=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')?'https':'http';
                        $host=preg_replace('/[^a-zA-Z0-9.\-:\[\]]/','',(string)($_SERVER['HTTP_HOST']??'localhost')) ?: 'localhost';
                        $path=rtrim(str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME'])),'/');
                        $link=$scheme.'://'.$host.$path.'/password-reset.php?token='.urlencode($token);
                        $sent=mail($email,'Atur ulang kata sandi - '.setting('company_name'),"Buka tautan ini dalam 30 menit untuk mengatur ulang kata sandi:\n\n".$link);
                        if(!$sent) error_log('Password reset email delivery failed for account ID '.(int)$user['id']);
                    }
                }
            }
            $message='Jika email terdaftar dan email server tersedia, tautan pengaturan ulang akan dikirim. Tautan berlaku 30 menit.';
        } elseif(($_POST['action']??'')==='reset') {
            $password=(string)($_POST['password']??'');
            if(strlen($password)<10) throw new RuntimeException('Kata sandi baru minimal 10 karakter.');
            $db->beginTransaction();
            $stmt=$db->prepare('SELECT id,user_id FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL ORDER BY id DESC LIMIT 1');
            $stmt->execute([hash('sha256',$token),time()]);$reset=$stmt->fetch();
            if(!$reset) throw new RuntimeException('Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.');
            $update=$db->prepare('UPDATE users SET password=? WHERE id=?');$update->execute([password_hash($password,PASSWORD_DEFAULT),$reset['user_id']]);
            $used=$db->prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL');
            $used->execute([time(),$reset['user_id']]);
            $db->commit();$message='Kata sandi berhasil diperbarui. Silakan masuk kembali.';
        }
    } catch(Throwable $exception) {
        if($db->inTransaction())$db->rollBack();
        $error=$exception->getMessage();
    }
}
$validReset=false;
if($token!=='') {
    $stmt=$db->prepare('SELECT id FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL LIMIT 1');
    $stmt->execute([hash('sha256',$token),time()]);$validReset=(bool)$stmt->fetch();
}
?>
<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atur ulang kata sandi — <?= h(setting('company_name')) ?></title><link rel="stylesheet" href="assets/style.css"></head><body class="admin-body"><main class="login-wrap"><section class="login-card"><span class="eyebrow">PEMULIHAN AKUN</span><h1><?= $validReset?'Buat kata sandi baru.':'Lupa kata sandi?' ?></h1><p><?= $validReset?'Pilih kata sandi baru minimal 10 karakter.':'Masukkan email akun admin atau editor.' ?></p><?php if($error): ?><div class="notice error"><?= h($error) ?></div><?php endif ?><?php if($message): ?><div class="notice success"><?= h($message) ?></div><?php endif ?>
<?php if($validReset): ?><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="reset"><input type="hidden" name="token" value="<?= h($token) ?>"><label>Kata sandi baru<input type="password" name="password" minlength="10" required autocomplete="new-password"></label><button class="button button-dark full-width">Simpan kata sandi</button></form><?php else: ?><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="request"><label>Email akun<input type="email" name="email" required autocomplete="email"></label><button class="button button-dark full-width">Kirim tautan pemulihan</button></form><?php endif ?><a class="back-link" href="admin.php">Kembali ke login</a></section></main></body></html>
