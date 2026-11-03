<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');
require_login(true);
$view = $_GET['view'] ?? 'orders';
$views = ['orders','users','analytics','backups','payments','hero','reviews','activity'];
if (!in_array($view,$views,true)) $view='orders';
if (($_GET['ajax'] ?? '') === 'live') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    $liveOrders=$db->query('SELECT id,order_number,status,shipping_carrier,tracking_number,tracking_url,updated_at FROM orders ORDER BY id DESC LIMIT 200')->fetchAll();
    foreach($liveOrders as &$liveOrder) $liveOrder['status_label']=order_status($liveOrder['status']);
    unset($liveOrder);
    $inventory=[];
    foreach($db->query("SELECT formats FROM products WHERE status='published'")->fetchAll() as $product) {
        foreach(json_decode($product['formats'] ?: '[]',true) ?: [] as $format) {
            $name=(string)($format['format']??'');
            if($name!=='') $inventory[$name]=($inventory[$name]??0)+max(0,(int)($format['stock']??0));
        }
    }
    echo json_encode([
        'revision'=>hash('sha256',json_encode($liveOrders,JSON_THROW_ON_ERROR)),
        'latest_id'=>(int)$db->query('SELECT COALESCE(MAX(id),0) FROM orders')->fetchColumn(),
        'pending'=>(int)$db->query("SELECT COUNT(*) FROM orders WHERE status IN ('awaiting_payment','awaiting_confirmation')")->fetchColumn(),
        'orders'=>$liveOrders,
        'inventory'=>$inventory,
    ],JSON_THROW_ON_ERROR);
    exit;
}
$error='';
$flash=$_SESSION['flash']??'';unset($_SESSION['flash']);
$restoreTempDirectory=null;

if($_SERVER['REQUEST_METHOD']==='POST') {
    try {
        verify_csrf();
        $action=$_POST['action']??'';
        if($action==='user_save') {
            $email=filter_var(strtolower(trim($_POST['email']??'')),FILTER_VALIDATE_EMAIL);
            $password=(string)($_POST['password']??'');
            $role=$_POST['role']??'';
            if(!$email||!in_array($role,['admin','editor'],true)) throw new RuntimeException('Email atau peran akun tidak valid.');
            if(strlen($password)<10) throw new RuntimeException('Kata sandi minimal 10 karakter.');
            $stmt=$db->prepare('INSERT INTO users (email,password,role) VALUES (?,?,?)');
            $stmt->execute([$email,password_hash($password,PASSWORD_DEFAULT),$role]);
            record_admin_activity('staff_added', json_encode(['email'=>$email,'role'=>$role],JSON_THROW_ON_ERROR));
            $_SESSION['flash']='Akun berhasil ditambahkan.';header('Location: manage.php?view=users');exit;
        }
        if($action==='change_password') {
            $userId=(int)($_SESSION['user_id']??0);
            $currentPassword=(string)($_POST['current_password']??'');
            $newPassword=(string)($_POST['new_password']??'');
            $confirmPassword=(string)($_POST['confirm_password']??'');
            if(strlen($newPassword)<10) throw new RuntimeException('Kata sandi baru minimal 10 karakter.');
            if($newPassword!==$confirmPassword) throw new RuntimeException('Konfirmasi kata sandi baru tidak cocok.');
            $db->exec('BEGIN IMMEDIATE');
            try {
                $stmt=$db->prepare("SELECT password FROM users WHERE id=? AND role='admin'");
                $stmt->execute([$userId]);$user=$stmt->fetch();
                if(!$user||!password_verify($currentPassword,$user['password'])) throw new RuntimeException('Kata sandi saat ini tidak sesuai.');
                if(password_verify($newPassword,$user['password'])) throw new RuntimeException('Kata sandi baru harus berbeda dari kata sandi saat ini.');
                $newHash=password_hash($newPassword,PASSWORD_DEFAULT);
                $update=$db->prepare('UPDATE users SET password=? WHERE id=? AND password=?');
                $update->execute([$newHash,$userId,$user['password']]);
                if($update->rowCount()!==1) throw new RuntimeException('Kata sandi tidak berhasil diperbarui. Coba lagi.');
                $invalidate=$db->prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL');
                $invalidate->execute([time(),$userId]);
                record_admin_activity('password_changed');
                $db->exec('COMMIT');
            } catch(Throwable $exception) {
                if($db->inTransaction())$db->rollBack();else{try{$db->exec('ROLLBACK');}catch(Throwable){}}
                throw $exception;
            }
            session_regenerate_id(true);
            $_SESSION['expires']=time()+3600;
            $_SESSION['flash']='Kata sandi berhasil diubah.';
            header('Location: manage.php?view=users');exit;
        }
        if($action==='user_delete') {
            $id=(int)($_POST['id']??0);
            if($id===(int)$_SESSION['user_id']) throw new RuntimeException('Akun yang sedang digunakan tidak dapat dihapus.');
            $target=$db->prepare('SELECT role FROM users WHERE id=?');$target->execute([$id]);$role=$target->fetchColumn();
            if($role==='admin'&&(int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()<=1) throw new RuntimeException('Toko harus memiliki setidaknya satu akun admin.');
            $stmt=$db->prepare('DELETE FROM users WHERE id=?');$stmt->execute([$id]);
            record_admin_activity('staff_deleted', json_encode(['user_id'=>$id],JSON_THROW_ON_ERROR));
            $_SESSION['flash']='Akun berhasil dihapus.';header('Location: manage.php?view=users');exit;
        }
        if($action==='order_status') {
            $id=(int)($_POST['id']??0);$newStatus=$_POST['status']??'';
            $valid=['awaiting_payment','awaiting_confirmation','confirmed','packing','shipped','completed','cancelled'];
            if(!in_array($newStatus,$valid,true)) throw new RuntimeException('Status pesanan tidak valid.');
            $carrier=trim((string)($_POST['shipping_carrier']??''));
            $trackingNumber=trim((string)($_POST['tracking_number']??''));
            $trackingUrl=trim((string)($_POST['tracking_url']??''));
            if(strlen($carrier)>80||strlen($trackingNumber)>100) throw new RuntimeException('Nama kurir atau nomor resi terlalu panjang.');
            if($trackingUrl!==''&&safe_tracking_url($trackingUrl)==='') throw new RuntimeException('Tautan pelacakan harus berupa URL HTTPS yang valid.');
            if($newStatus==='shipped'&&($carrier===''||$trackingNumber==='')) throw new RuntimeException('Isi nama kurir dan nomor resi sebelum menandai pesanan terkirim.');
            $db->exec('BEGIN IMMEDIATE');
            try {
                $stmt=$db->prepare('SELECT * FROM orders WHERE id=?');$stmt->execute([$id]);$order=$stmt->fetch();
                if(!$order) throw new RuntimeException('Pesanan tidak ditemukan.');
                if($order['status']==='cancelled'&&$newStatus!=='cancelled') throw new RuntimeException('Pesanan yang dibatalkan tidak dapat dibuka kembali. Buat pesanan baru.');
                if($newStatus==='cancelled'&&$order['payment_method']==='midtrans'&&$order['status']==='awaiting_payment'&&$order['payment_url']!=='') throw new RuntimeException('Pembayaran Midtrans masih aktif. Batalkan transaksi dari dashboard Midtrans atau tunggu notifikasi kedaluwarsa sebelum mengembalikan stok.');
                $transitions=[
                    'awaiting_payment'=>['confirmed','cancelled'],
                    'awaiting_confirmation'=>['confirmed','cancelled'],
                    'confirmed'=>['packing'],
                    'packing'=>['shipped'],
                    'shipped'=>['completed'],
                    'completed'=>[],
                    'cancelled'=>[],
                ];
                if($newStatus!==$order['status']&&!in_array($newStatus,$transitions[$order['status']]??[],true)) throw new RuntimeException('Perubahan status tidak sesuai urutan proses pesanan.');
                if($newStatus==='cancelled'&&$order['status']!=='cancelled') {
                    restore_order_stock($db,$id);
                }
                $update=$db->prepare('UPDATE orders SET status=?,shipping_carrier=?,tracking_number=?,tracking_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
                $update->execute([$newStatus,$carrier,$trackingNumber,$trackingUrl,$id]);
                if($newStatus!==$order['status']) {
                    record_admin_activity('order_status_changed', json_encode(['order_id'=>$id,'from'=>$order['status'],'to'=>$newStatus],JSON_THROW_ON_ERROR));
                    $notificationEvents=['confirmed'=>'confirmed','shipped'=>'shipped','completed'=>'completed','cancelled'=>'cancelled'];
                    if(isset($notificationEvents[$newStatus])) queue_order_notification($db,$id,$notificationEvents[$newStatus]);
                }
                $db->exec('COMMIT');
            } catch(Throwable $exception) {
                if($db->inTransaction())$db->rollBack();else{try{$db->exec('ROLLBACK');}catch(Throwable){}}
                throw $exception;
            }
            $_SESSION['flash']='Status pesanan diperbarui.';header('Location: manage.php?view=orders');exit;
        }
        if($action==='save_payments') {
            $mode=(string)($_POST['midtrans_mode']??'sandbox');
            if(!in_array($mode,['sandbox','production'],true)) throw new RuntimeException('Pilih mode Midtrans yang valid.');
            $serverKey=trim((string)($_POST['midtrans_server_key']??''));
            if(empty($_POST['clear_midtrans_server_key'])&&$serverKey!==''&&(strlen($serverKey)>256||preg_match('/\s/',$serverKey))) throw new RuntimeException('Kunci server Midtrans tidak valid.');
            $paymentSettings=[];
            foreach(['shipping_fee','whatsapp_phone'] as $key) {
                $value=trim((string)($_POST[$key]??''));
                if($key==='shipping_fee'&&(!ctype_digit($value)||(int)$value<0)) throw new RuntimeException('Ongkir harus berupa angka 0 atau lebih.');
                if($key==='whatsapp_phone'&&$value!==''&&!preg_match('/^\+?[0-9 ()-]{8,24}$/',$value)) throw new RuntimeException('Nomor WhatsApp harus berisi 8–24 digit dan karakter +, spasi, tanda kurung, atau tanda hubung.');
                $paymentSettings[$key]=$value;
            }
            $bankInput=$_POST['bank_accounts']??[];
            if(!is_array($bankInput)) throw new RuntimeException('Data rekening bank tidak valid.');
            $bankConfiguration=[];
            $firstConfiguredBank=null;
            foreach(manual_bank_catalog() as $code=>$bank) {
                $entry=$bankInput[$code]??[];
                if(!is_array($entry)) throw new RuntimeException('Data rekening '.$bank['name'].' tidak valid.');
                $accountValue=$entry['account']??'';
                $holderValue=$entry['holder']??'';
                if(!is_string($accountValue)||!is_string($holderValue)) throw new RuntimeException('Data rekening '.$bank['name'].' tidak valid.');
                $account=trim($accountValue);
                $holder=trim($holderValue);
                if(($account==='')!==($holder==='')) throw new RuntimeException('Isi nomor dan nama pemilik rekening '.$bank['name'].' secara lengkap, atau kosongkan keduanya.');
                $accountDigits=preg_replace('/\D+/', '', $account)??'';
                if($account!==''&&(!preg_match('/^[0-9][0-9 -]{3,30}$/',$account)||strlen($accountDigits)<5||strlen($accountDigits)>30)) throw new RuntimeException('Nomor rekening '.$bank['name'].' harus berisi 5–30 digit.');
                if(strlen($holder)>160) throw new RuntimeException('Nama pemilik rekening '.$bank['name'].' terlalu panjang.');
                $bankConfiguration[$code]=['account'=>$account,'holder'=>$holder];
                if($account!==''&&$firstConfiguredBank===null) $firstConfiguredBank=['name'=>$bank['name'],'account'=>$account,'holder'=>$holder];
            }
            $stmt=$db->prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
            foreach($paymentSettings as $key=>$value) $stmt->execute([$key,$value]);
            $stmt->execute(['manual_bank_accounts',json_encode($bankConfiguration,JSON_THROW_ON_ERROR)]);
            $legacyBank=$firstConfiguredBank??['name'=>'BCA','account'=>'','holder'=>''];
            foreach(['bank_name'=>$legacyBank['name'],'bank_account'=>$legacyBank['account'],'bank_account_name'=>$legacyBank['holder']] as $key=>$value) $stmt->execute([$key,$value]);
            $stmt->execute(['midtrans_mode',$mode]);
            if(!empty($_POST['clear_midtrans_server_key'])) {
                $stmt->execute(['midtrans_server_key','']);
            } elseif($serverKey!=='') {
                $stmt->execute(['midtrans_server_key',$serverKey]);
            }
            record_admin_activity('payment_shipping_settings_updated', 'Pengaturan pembayaran/pengiriman diperbarui; nilai rahasia tidak dicatat.');
            $_SESSION['flash']='Informasi pembayaran dan pengiriman disimpan.';header('Location: manage.php?view=payments');exit;
        }
        if($action==='review_moderate') {
            $id=(int)($_POST['id']??0);
            $status=(string)($_POST['status']??'');
            if(!in_array($status,['published','rejected'],true)) throw new RuntimeException('Status ulasan tidak valid.');
            $stmt=$db->prepare('UPDATE product_reviews SET status=? WHERE id=? AND status<>\'published\'');
            $stmt->execute([$status,$id]);
            if($stmt->rowCount()!==1) throw new RuntimeException('Ulasan tidak ditemukan atau sudah dipublikasikan.');
            record_admin_activity('review_moderated', json_encode(['review_id'=>$id,'status'=>$status],JSON_THROW_ON_ERROR));
            $_SESSION['flash']='Moderasi ulasan berhasil disimpan.';header('Location: manage.php?view=reviews');exit;
        }
        if($action==='save_hero') {
            $url=trim((string)($_POST['hero_video']??''));
            if($url!==''&&(!filter_var($url,FILTER_VALIDATE_URL)||strtolower((string)parse_url($url,PHP_URL_SCHEME))!=='https')) throw new RuntimeException('Video hero harus menggunakan tautan HTTPS yang valid.');
            $stmt=$db->prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');$stmt->execute(['hero_video',$url]);
            $_SESSION['flash']='Pengaturan video hero berhasil disimpan.';header('Location: manage.php?view=hero');exit;
        }
        if($action==='create_backup') {
            if(!class_exists(ZipArchive::class)) throw new RuntimeException('Ekstensi PHP ZipArchive belum aktif.');
            $tables=['settings','users','products','articles','media','orders','order_items','product_reviews','admin_activity','product_views','search_terms'];
            $data=[];foreach($tables as $table)$data[$table]=$db->query('SELECT * FROM '.$table)->fetchAll();
            redact_backup_secrets($data);
            $path=__DIR__.'/storage/backup-'.date('Ymd-His').'-'.bin2hex(random_bytes(3)).'.zip';
            $zip=new ZipArchive();if($zip->open($path,ZipArchive::CREATE)!==true)throw new RuntimeException('Arsip backup tidak dapat dibuat.');
            $zip->addFromString('backup.json',json_encode(['version'=>1,'created_at'=>date(DATE_ATOM),'tables'=>$data],JSON_THROW_ON_ERROR));
            foreach($data['media'] as $file){$name=basename($file['filename']);$filePath=UPLOAD_DIR.DIRECTORY_SEPARATOR.$name;if(is_file($filePath))$zip->addFile($filePath,'uploads/'.$name);}
            $zip->close();header('Content-Type: application/zip');header('Content-Disposition: attachment; filename="'.basename($path).'"');header('Content-Length: '.filesize($path));readfile($path);unlink($path);exit;
        }
        if($action==='restore_backup') {
            if(!class_exists(ZipArchive::class))throw new RuntimeException('Ekstensi PHP ZipArchive belum aktif.');
            if(($_POST['confirm_restore']??'')!=='RESTORE')throw new RuntimeException('Ketik RESTORE untuk mengonfirmasi pemulihan.');
            if(($_FILES['backup_file']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)throw new RuntimeException('Pilih file backup terlebih dahulu.');
            if($_FILES['backup_file']['size']>100*1024*1024)throw new RuntimeException('Ukuran file backup maksimal 100 MB.');
            $zip=new ZipArchive();if($zip->open($_FILES['backup_file']['tmp_name'])!==true)throw new RuntimeException('File backup tidak dapat dibuka.');
            if($zip->numFiles>5000){$zip->close();throw new RuntimeException('Arsip backup berisi terlalu banyak file.');}
            $uncompressedSize=0;
            for($entryIndex=0;$entryIndex<$zip->numFiles;$entryIndex++){$stat=$zip->statIndex($entryIndex);$uncompressedSize+=(int)($stat['size']??0);if($uncompressedSize>300*1024*1024){$zip->close();throw new RuntimeException('Ukuran data dalam arsip backup terlalu besar.');}}
            $manifestStat=$zip->statName('backup.json');
            if(!$manifestStat||(int)$manifestStat['size']>25*1024*1024){$zip->close();throw new RuntimeException('Data backup terlalu besar atau tidak ditemukan.');}
            $manifest=$zip->getFromName('backup.json');$decoded=$manifest===false?null:json_decode($manifest,true);
            $tables=['settings','users','products','articles','media','orders','order_items','product_reviews','admin_activity','product_views','search_terms'];
            if(is_array($decoded['tables']??null)) {
                $decoded['tables']['product_reviews']??=[];
                $decoded['tables']['admin_activity']??=[];
            }
            if(!is_array($decoded)||($decoded['version']??null)!==1||!is_array($decoded['tables']??null)){$zip->close();throw new RuntimeException('Format file backup tidak didukung.');}
            foreach($tables as $table)if(!isset($decoded['tables'][$table])||!is_array($decoded['tables'][$table])){$zip->close();throw new RuntimeException('Backup tidak lengkap.');}
            if(!array_filter($decoded['tables']['users'],static fn($user)=>($user['role']??'')==='admin')){$zip->close();throw new RuntimeException('Backup harus memuat setidaknya satu akun admin.');}
            $files=[];
            foreach($decoded['tables']['media'] as $entry) {
                $name=basename((string)($entry['filename']??''));
                if(!preg_match('/^[a-f0-9]{32}\.(jpg|png|webp|svg)$/',$name)){$zip->close();throw new RuntimeException('Nama file dalam backup tidak valid.');}
                $fileStat=$zip->statName('uploads/'.$name);
                if(!$fileStat||(int)$fileStat['size']>3*1024*1024){$zip->close();throw new RuntimeException('Ukuran media dalam backup tidak valid.');}
                $content=$zip->getFromName('uploads/'.$name);if($content===false){$zip->close();throw new RuntimeException('File media tidak ditemukan dalam backup.');}
                $mime=(new finfo(FILEINFO_MIME_TYPE))->buffer($content);
                $expected=['jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','svg'=>'image/svg+xml'][pathinfo($name,PATHINFO_EXTENSION)]??'';
                if($mime!==$expected){$zip->close();throw new RuntimeException('Tipe file dalam backup tidak cocok.');}
                if($restoreTempDirectory===null) {
                    $tempBase=tempnam(sys_get_temp_dir(),'rm-restore-');
                    if($tempBase===false)throw new RuntimeException('Folder sementara untuk pemulihan tidak dapat dibuat.');
                    unlink($tempBase);$restoreTempDirectory=$tempBase;
                    if(!mkdir($restoreTempDirectory,0700))throw new RuntimeException('Folder sementara untuk pemulihan tidak dapat dibuat.');
                }
                $tempFile=$restoreTempDirectory.DIRECTORY_SEPARATOR.$name;
                if(file_put_contents($tempFile,$content)===false)throw new RuntimeException('File media sementara gagal disimpan.');
                $files[$name]=$tempFile;
                unset($content);
            }
            $zip->close();$db->exec('BEGIN IMMEDIATE');
            $preservedMidtransKey=setting('midtrans_server_key');
            try {
                foreach(['email_outbox','product_reviews','order_items','orders','admin_activity','product_views','search_terms','articles','products','media','users','settings','login_attempts','password_resets'] as $table)$db->exec('DELETE FROM '.$table);
                foreach($tables as $table) {
                    $columns=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');
                    foreach($decoded['tables'][$table] as $row) {
                        if(!is_array($row))throw new RuntimeException('Data backup tidak valid.');
                        $row=array_intersect_key($row,array_flip($columns));if(!$row)continue;
                        $names=array_keys($row);$quoted=array_map(static fn($name)=>'"'.$name.'"',$names);
                        $sql='INSERT INTO "'.$table.'" ('.implode(',',$quoted).') VALUES ('.implode(',',array_fill(0,count($names),'?')).')';
                        $db->prepare($sql)->execute(array_values($row));
                    }
                }
                $db->exec('COMMIT');
            } catch(Throwable $exception) {if($db->inTransaction())$db->rollBack();else{try{$db->exec('ROLLBACK');}catch(Throwable){}}throw $exception;}
            restore_payment_secrets($db,$preservedMidtransKey);
            foreach($files as $name=>$tempFile)if(!copy($tempFile,UPLOAD_DIR.DIRECTORY_SEPARATOR.$name))throw new RuntimeException('Data pulih tetapi file media gagal disimpan: '.$name);
            if($restoreTempDirectory!==null){foreach($files as $tempFile)if(is_file($tempFile))unlink($tempFile);rmdir($restoreTempDirectory);$restoreTempDirectory=null;}
            $_SESSION['flash']='Backup berhasil dipulihkan.';header('Location: manage.php?view=backups');exit;
        }
        throw new RuntimeException('Aksi tidak dikenal.');
    } catch(Throwable $exception) {
        if($restoreTempDirectory!==null&&is_dir($restoreTempDirectory)){foreach(scandir($restoreTempDirectory)?:[] as $name)if($name!=='.'&&$name!=='..'&&is_file($restoreTempDirectory.DIRECTORY_SEPARATOR.$name))unlink($restoreTempDirectory.DIRECTORY_SEPARATOR.$name);rmdir($restoreTempDirectory);}
        $error=$exception->getMessage();
    }
}
$orderStatusFilter=(string)($_GET['status']??'');
$paymentFilter=(string)($_GET['payment']??'');
$orderSearch=trim(substr((string)($_GET['q']??''),0,100));
$fromDate=(string)($_GET['from']??'');
$toDate=(string)($_GET['to']??'');
$validStatuses=['awaiting_payment','awaiting_confirmation','confirmed','packing','shipped','completed','cancelled'];
if(!in_array($orderStatusFilter,$validStatuses,true)) $orderStatusFilter='';
if(!in_array($paymentFilter,['bank_transfer','midtrans','cod'],true)) $paymentFilter='';
foreach(['from','to'] as $dateKey) {
    $dateFilter=$dateKey==='from'?$fromDate:$toDate;
    $parsedDate=$dateFilter!==''&&preg_match('/^\d{4}-\d{2}-\d{2}$/',$dateFilter)?DateTimeImmutable::createFromFormat('!Y-m-d',$dateFilter):false;
    $dateErrors=DateTimeImmutable::getLastErrors();
    if($dateFilter!==''&&(!$parsedDate||$parsedDate->format('Y-m-d')!==$dateFilter||($dateErrors&&($dateErrors['warning_count']||$dateErrors['error_count'])))) {
        if($dateKey==='from') $fromDate=''; else $toDate='';
    }
}
$orderWhere=[];$orderParams=[];
if($orderStatusFilter!=='') {$orderWhere[]='status=?';$orderParams[]=$orderStatusFilter;}
if($paymentFilter!=='') {$orderWhere[]='payment_method=?';$orderParams[]=$paymentFilter;}
if($orderSearch!=='') {$orderWhere[]='order_number LIKE ?';$orderParams[]='%'.$orderSearch.'%';}
if($fromDate!=='') {$orderWhere[]='date(created_at)>=?';$orderParams[]=$fromDate;}
if($toDate!=='') {$orderWhere[]='date(created_at)<=?';$orderParams[]=$toDate;}
$ordersQuery='SELECT * FROM orders'.($orderWhere?' WHERE '.implode(' AND ',$orderWhere):'').' ORDER BY id DESC LIMIT 200';
$ordersStmt=$db->prepare($ordersQuery);$ordersStmt->execute($orderParams);$orders=$ordersStmt->fetchAll();
$latestOrderId=(int)$db->query('SELECT COALESCE(MAX(id),0) FROM orders')->fetchColumn();
$pendingOrderCount=(int)$db->query("SELECT COUNT(*) FROM orders WHERE status IN ('awaiting_payment','awaiting_confirmation')")->fetchColumn();
$inventory=[];
foreach($db->query("SELECT formats FROM products WHERE status='published'")->fetchAll() as $product) {
    foreach(json_decode($product['formats'] ?: '[]',true) ?: [] as $format) {
        $name=(string)($format['format']??'');
        if($name!=='') $inventory[$name]=($inventory[$name]??0)+max(0,(int)($format['stock']??0));
    }
}
$users=$db->query('SELECT id,email,role FROM users ORDER BY role,email')->fetchAll();
$stmt=$db->prepare("SELECT p.title,COUNT(v.id) AS views FROM products p LEFT JOIN product_views v ON v.product_id=p.id AND v.viewed_at>? WHERE p.status<>'archived' GROUP BY p.id ORDER BY views DESC LIMIT 10");$stmt->execute([time()-30*86400]);$topProducts=$stmt->fetchAll();
$stmt=$db->prepare('SELECT term,COUNT(*) AS searches FROM search_terms WHERE searched_at>? GROUP BY term ORDER BY searches DESC LIMIT 10');$stmt->execute([time()-30*86400]);$topSearches=$stmt->fetchAll();
$viewTitles=['orders'=>'Pesanan','users'=>'Akun staf','analytics'=>'Analitik','backups'=>'Backup dan pemulihan','payments'=>'Pengiriman dan pembayaran','hero'=>'Tampilan hero','reviews'=>'Moderasi ulasan','activity'=>'Riwayat aktivitas'];
$appScheme=!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'?'https':'http';
$appHost=(string)($_SERVER['SERVER_NAME']??'');
$appPort=(int)($_SERVER['SERVER_PORT']??($appScheme==='https'?443:80));
$appBaseUrl=$appScheme.'://'.$appHost.($appPort!==($appScheme==='https'?443:80)?':'.$appPort:'');
$appDirectory=trim(str_replace('\\','/',dirname((string)($_SERVER['SCRIPT_NAME']??'/manage.php'))),'/');
$midtransNotificationUrl=$appBaseUrl.($appDirectory!==''?'/'.$appDirectory:'').'/payment-webhook.php';
$bankAccountConfiguration=manual_bank_configuration();
?>
<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?= h($viewTitles[$view]) ?> — <?= h(setting('company_name')) ?></title><link rel="stylesheet" href="assets/style.css?v=<?= (int)filemtime(__DIR__ . '/assets/style.css') ?>"><link rel="stylesheet" href="assets/brand.css"><link rel="stylesheet" href="assets/payment.css"><script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script></head><body class="admin-body">
<div class="admin-shell"><aside class="admin-sidebar"><a class="brand" href="index.php"><?= logo_mark() ?></a><nav><a href="admin.php">Ringkasan</a><a href="admin.php?tab=products">Produk</a><a href="admin.php?tab=articles">Artikel</a><a href="?view=orders">Pesanan</a><a href="?view=reviews">Ulasan</a><a href="?view=activity">Aktivitas admin</a><a href="?view=users">Akun staf</a><a href="?view=analytics">Analitik</a><a href="?view=backups">Backup</a><a href="?view=payments">Pembayaran</a><a href="?view=hero">Tampilan hero</a><a href="admin.php?tab=settings">Pengaturan situs</a></nav><div class="sidebar-bottom"><a href="index.php">Lihat toko</a><span><?= h($_SESSION['email']) ?> · admin</span><a href="admin.php">Kembali ke dashboard</a></div></aside>
<main class="admin-main"><header class="admin-top"><div><span class="eyebrow">RUANG KERJA</span><h1><?= h($viewTitles[$view]) ?></h1></div><button class="icon-btn theme-toggle" aria-label="Ganti tema">Tema</button></header><?php if($flash): ?><div class="notice success"><?= h($flash) ?></div><?php endif ?><?php if($error): ?><div class="notice error"><?= h($error) ?></div><?php endif ?>
<?php if($view==='orders'): ?>
<section class="admin-stats live-order-stats" data-live-latest="<?= $latestOrderId ?>">
<article><span>PESANAN MENUNGGU</span><strong data-live-pending><?= $pendingOrderCount ?></strong><small data-live-sync-status>Sinkron otomatis setiap 10 detik</small></article>
<?php foreach($inventory as $formatName=>$stockCount): ?><article><span>STOK <?= h(strtoupper($formatName)) ?></span><strong data-live-stock="<?= h($formatName) ?>"><?= $stockCount ?></strong><small>Unit tersedia dari produk aktif</small></article><?php endforeach ?>
</section>
<p class="checkout-note">Pesanan baru disinkronkan ke dashboard setiap 10 detik. Email otomatis belum aktif karena kanal hosting/SMTP belum disiapkan; tautan WhatsApp toko siap digunakan setelah nomor disimpan di Pengiriman dan pembayaran.</p>
<form method="get" class="order-filters"><input type="hidden" name="view" value="orders"><label>Cari nomor pesanan<input name="q" value="<?= h($orderSearch) ?>" placeholder="RM-..."></label><label>Status<select name="status"><option value="">Semua status</option><?php foreach($validStatuses as $status): ?><option value="<?= h($status) ?>" <?= $orderStatusFilter===$status?'selected':'' ?>><?= h(order_status($status)) ?></option><?php endforeach ?></select></label><label>Pembayaran<select name="payment"><option value="">Semua metode</option><option value="bank_transfer" <?= $paymentFilter==='bank_transfer'?'selected':'' ?>>Transfer bank</option><option value="midtrans" <?= $paymentFilter==='midtrans'?'selected':'' ?>>Midtrans</option><option value="cod" <?= $paymentFilter==='cod'?'selected':'' ?>>COD</option></select></label><label>Dari tanggal<input type="date" name="from" value="<?= h($fromDate) ?>"></label><label>Sampai tanggal<input type="date" name="to" value="<?= h($toDate) ?>"></label><button class="button button-dark">Filter</button><a class="filter-reset" href="manage.php?view=orders">Reset</a></form>
<div class="notice success live-order-notice" data-live-notice hidden><span data-live-message></span> <a class="button button-outline" href="manage.php?view=orders">Muat pesanan terbaru</a></div>
<div class="table-wrap"><table><thead><tr><th>Pesanan</th><th>Pelanggan dan alamat</th><th>Rilisan</th><th>Total</th><th>Status dan pelacakan</th></tr></thead><tbody>
<?php foreach($orders as $order):$itemStmt=$db->prepare('SELECT * FROM order_items WHERE order_id=?');$itemStmt->execute([$order['id']]);$items=$itemStmt->fetchAll();$transitions=['awaiting_payment'=>['confirmed','cancelled'],'awaiting_confirmation'=>['confirmed','cancelled'],'confirmed'=>['packing'],'packing'=>['shipped'],'shipped'=>['completed'],'completed'=>[],'cancelled'=>[]];if($order['payment_method']==='midtrans'&&$order['payment_url']!=='')$transitions['awaiting_payment']=[];$options=array_unique(array_merge([$order['status']],$transitions[$order['status']]??[]));$ageHours=(time()-strtotime($order['created_at']))/3600; ?>
<tr data-live-order="<?= (int)$order['id'] ?>"><td><strong><?= h($order['order_number']) ?></strong><?php if($ageHours<24): ?><small class="order-flag">BARU</small><?php elseif($ageHours>=48&&in_array($order['status'],['awaiting_payment','awaiting_confirmation','confirmed','packing'],true)): ?><small class="order-flag overdue">PERLU DITINDAKLANJUTI</small><?php endif ?><small><?= h($order['created_at']) ?></small><small><?= $order['payment_method']==='cod'?'COD':($order['payment_method']==='midtrans'?'Midtrans':'Transfer manual') ?></small></td><td><strong><?= h($order['customer_name']) ?></strong><small><?= h($order['email']) ?> · <?= h($order['phone']) ?></small><small><?= h($order['address']) ?>, <?= h($order['city']) ?> <?= h($order['postal_code']) ?></small></td><td><?php foreach($items as $item): ?><small><?= h($item['title']) ?> / <?= h($item['format']) ?> × <?= (int)$item['quantity'] ?></small><?php endforeach ?></td><td><?= money((int)$order['total']) ?></td><td><strong class="live-order-status"><?= h(order_status($order['status'])) ?></strong><small class="live-order-tracking"><?php if($order['tracking_number']!==''): ?><?= h($order['shipping_carrier']) ?> · <?= h($order['tracking_number']) ?><?php endif ?></small><form method="post" class="status-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="order_status"><input type="hidden" name="id" value="<?= (int)$order['id'] ?>"><select name="status"><?php foreach($options as $status): ?><option value="<?= h($status) ?>" <?= $order['status']===$status?'selected':'' ?>><?= h(order_status($status)) ?></option><?php endforeach ?></select><input name="shipping_carrier" maxlength="80" placeholder="Kurir" value="<?= h($order['shipping_carrier']) ?>"><input name="tracking_number" maxlength="100" placeholder="Nomor resi" value="<?= h($order['tracking_number']) ?>"><input type="url" name="tracking_url" placeholder="Tautan pelacakan" value="<?= h($order['tracking_url']) ?>"><button class="small-action">Simpan</button></form></td></tr>
<?php endforeach ?></tbody></table></div>
<?php elseif($view==='reviews'): ?><div class="table-wrap"><table><thead><tr><th>Album</th><th>Ulasan</th><th>Rating</th><th>Dikirim</th><th>Moderasi</th></tr></thead><tbody><?php $reviews=$db->query("SELECT r.*,p.title,p.artist,oi.format,o.order_number FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN order_items oi ON oi.id=r.order_item_id JOIN orders o ON o.id=r.order_id WHERE r.status='pending' ORDER BY r.created_at ASC LIMIT 200")->fetchAll(); foreach($reviews as $review): ?><tr><td><strong><?= h($review['title']) ?></strong><small><?= h($review['artist']) ?> · <?= h($review['format']) ?></small><small>Pesanan <?= h($review['order_number']) ?></small></td><td><?= nl2br(h($review['comment'])) ?></td><td><?= str_repeat('★',(int)$review['rating']) ?><?= str_repeat('☆',5-(int)$review['rating']) ?></td><td><?= h($review['created_at']) ?></td><td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="review_moderate"><input type="hidden" name="id" value="<?= (int)$review['id'] ?>"><button name="status" value="published" class="small-action">Terbitkan</button><button name="status" value="rejected" class="text-button">Tolak</button></form></td></tr><?php endforeach ?><?php if(!$reviews): ?><tr><td colspan="5">Tidak ada ulasan yang menunggu moderasi.</td></tr><?php endif ?></tbody></table></div>
<?php elseif($view==='activity'): ?><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Admin</th><th>Aktivitas</th><th>Detail</th></tr></thead><tbody><?php foreach($db->query('SELECT * FROM admin_activity ORDER BY id DESC LIMIT 300')->fetchAll() as $activity): ?><tr><td><?= h($activity['created_at']) ?></td><td><?= h($activity['actor']) ?></td><td><?= h($activity['action']) ?></td><td><?= h($activity['details']) ?></td></tr><?php endforeach ?></tbody></table></div>
<?php elseif($view==='users'): ?>
<form class="admin-form user-form" method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="user_save"><div class="form-grid"><label>Email akun<input type="email" name="email" required></label><label>Peran<select name="role"><option value="editor">Editor</option><option value="admin">Admin</option></select></label><label class="span-2">Kata sandi awal<input type="password" name="password" minlength="10" required><small>Minimal 10 karakter.</small></label></div><button class="button button-dark">Tambah akun</button></form>
<form class="admin-form password-change-form" method="post" data-password-change><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="change_password"><h2>Ubah kata sandi admin</h2><p>Masukkan kata sandi saat ini dan kata sandi baru. Perubahan diterapkan setelah formulir disimpan.</p><div class="form-grid"><label>Kata sandi saat ini<input type="password" name="current_password" autocomplete="current-password" required></label><label>Kata sandi baru<input type="password" name="new_password" autocomplete="new-password" minlength="10" required><small>Minimal 10 karakter.</small></label><label class="span-2">Konfirmasi kata sandi baru<input type="password" name="confirm_password" autocomplete="new-password" minlength="10" required><small data-password-match aria-live="polite"></small></label></div><button class="button button-dark">Simpan kata sandi baru</button></form>
<div class="table-wrap"><table><thead><tr><th>Email</th><th>Peran</th><th>Aksi</th></tr></thead><tbody><?php foreach($users as $user): ?><tr><td><?= h($user['email']) ?></td><td><?= h($user['role']) ?></td><td><?php if((int)$user['id']!==(int)$_SESSION['user_id']): ?><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="user_delete"><input type="hidden" name="id" value="<?= (int)$user['id'] ?>"><button class="text-button" data-confirm="Hapus akses akun ini?">Hapus</button></form><?php else: ?>Akun aktif<?php endif ?></td></tr><?php endforeach ?></tbody></table></div>
<?php elseif($view==='analytics'): ?><section class="analytics-grid"><div class="table-wrap"><h2>Produk paling banyak dilihat · 30 hari</h2><table><thead><tr><th>Produk</th><th>Jumlah</th></tr></thead><tbody><?php foreach($topProducts as $item): ?><tr><td><?= h($item['title']) ?></td><td><?= (int)$item['views'] ?></td></tr><?php endforeach ?></tbody></table></div><div class="table-wrap"><h2>Pencarian populer · 30 hari</h2><table><thead><tr><th>Kata pencarian</th><th>Jumlah</th></tr></thead><tbody><?php foreach($topSearches as $item): ?><tr><td><?= h($item['term']) ?></td><td><?= (int)$item['searches'] ?></td></tr><?php endforeach ?></tbody></table></div></section>
<?php elseif($view==='payments'): ?>
<form class="admin-form" method="post" autocomplete="off">
<input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="save_payments">
<h2>Pembayaran Midtrans</h2>
<div class="form-grid">
<label>Mode pembayaran<select name="midtrans_mode"><option value="sandbox" <?= setting('midtrans_mode')==='sandbox'?'selected':'' ?>>Sandbox · pengujian</option><option value="production" <?= setting('midtrans_mode')==='production'?'selected':'' ?>>Produksi · transaksi nyata</option></select></label>
<label>Kunci server Midtrans<input type="password" name="midtrans_server_key" value="" maxlength="256" autocomplete="new-password" placeholder="<?= setting('midtrans_server_key')!==''?'Kunci sudah tersimpan — kosongkan untuk mempertahankan':'Masukkan Server Key dari dashboard Midtrans' ?>"><small><?= setting('midtrans_server_key')!==''?'Kunci tersimpan dan tidak ditampilkan kembali.':'Kunci belum diatur; pilihan Midtrans belum tersedia saat checkout.' ?></small></label>
<label class="payment-option span-2"><input type="checkbox" name="clear_midtrans_server_key" value="1"><span><strong>Hapus Server Key tersimpan</strong><small>Nonaktifkan pembayaran Midtrans di checkout.</small></span></label>
</div>
<p class="checkout-note">Isi Notification URL di dashboard Midtrans dengan <code><?= h($midtransNotificationUrl) ?></code>. Webhook produksi harus menggunakan HTTPS dan situs harus dapat diakses publik. Halaman pembayaran kembali ke detail pesanan secara otomatis. Server Key hanya digunakan di server dan tidak pernah ditampilkan ulang.</p>
<h2>Transfer manual dan pengiriman</h2>
<div class="form-grid"><label>Ongkir dasar (Rp)<input type="number" name="shipping_fee" min="0" value="<?= h(setting('shipping_fee')) ?>"></label>
<?php foreach(manual_bank_catalog() as $code=>$bank): ?><section class="bank-admin-option span-2"><h3><img src="<?= h($bank['logo']) ?>" alt="Logo <?= h($bank['name']) ?>">Rekening <?= h($bank['name']) ?></h3><div class="form-grid"><label>Nomor rekening<input name="bank_accounts[<?= h($code) ?>][account]" inputmode="numeric" maxlength="32" value="<?= h($bankAccountConfiguration[$code]['account']) ?>" placeholder="Kosongkan jika rekening ini tidak digunakan"></label><label>Nama pemilik rekening<input name="bank_accounts[<?= h($code) ?>][holder]" maxlength="160" value="<?= h($bankAccountConfiguration[$code]['holder']) ?>" placeholder="Sesuai nama pada rekening"></label></div></section><?php endforeach ?>
<label>Nomor WhatsApp toko<input name="whatsapp_phone" value="<?= h(setting('whatsapp_phone')) ?>" placeholder="62812..."><small>Isi kode negara, misalnya 62812...; kosongkan jika belum siap. Tautan siap-klik akan ditampilkan di toko.</small></label></div>
<p class="checkout-note">Transfer bank hanya tersedia untuk rekening yang sudah diisi lengkap. Kosongkan nomor dan nama pemilik untuk menonaktifkan bank tersebut. Pastikan rekening yang disimpan memang milik toko.</p>
<p class="checkout-note">Kurir belum terhubung otomatis. Setelah pesanan disiapkan, isi nama kurir, nomor resi, dan tautan pelacakan dari menu Pesanan.</p>
<button class="button button-dark">Simpan pengaturan pembayaran</button></form>
<?php elseif($view==='hero'): ?><form class="admin-form" method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="save_hero"><label>URL video hero (MP4/WebM, HTTPS)<input type="url" name="hero_video" value="<?= h(setting('hero_video')) ?>" placeholder="https://.../video.mp4"><small>Video akan diputar otomatis tanpa suara dan berulang. Kosongkan untuk memakai foto fallback. Gunakan file video yang ringan dan sediakan akses HTTPS.</small></label><button class="button button-dark">Simpan video hero</button></form>
<?php else: ?><section class="backup-panel"><h2>Backup situs</h2><p>Arsip menyertakan pengaturan, akun staf, produk, artikel, pesanan, analitik, dan media.</p><form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="create_backup"><button class="button button-dark">Unduh backup ZIP</button></form><p>Backup terjadwal: jalankan <code>php backup-cli.php</code> melalui Windows Task Scheduler setiap hari. Arsip tersimpan di storage/backups dan backup yang berumur lebih dari 30 hari dibersihkan.</p></section><section class="backup-panel"><h2>Pulihkan backup</h2><p>Pemulihan mengganti data yang tersimpan. Unduh backup kondisi saat ini terlebih dahulu.</p><form method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="restore_backup"><label>File backup<input type="file" name="backup_file" accept=".zip,application/zip" required></label><label>Ketik RESTORE untuk konfirmasi<input name="confirm_restore" required></label><button class="button button-dark" data-confirm="Pemulihan mengganti seluruh data situs. Lanjutkan?">Pulihkan backup</button></form></section><?php endif ?>
</main></div><script src="assets/app.js?v=<?= (int)filemtime(__DIR__ . '/assets/app.js') ?>" defer></script></body></html>
