<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');
$number = (string)($_GET['number'] ?? '');
$lookupError = '';
$lookupNumber = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'lookup_order') {
    verify_csrf();
    $lookupNumber = strtoupper(trim((string)($_POST['order_number'] ?? '')));
    $lookupEmail = strtolower(trim((string)($_POST['email'] ?? '')));
    if (!preg_match('/^RM-\d{6}-[A-F0-9]{32}$/', $lookupNumber)) {
        $lookupError = 'Format nomor pesanan tidak valid. Gunakan format seperti RM-123456-ABCDEF1234.';
    } elseif (!filter_var($lookupEmail, FILTER_VALIDATE_EMAIL)) {
        $lookupError = 'Alamat email tidak valid.';
    } else {
        $lookupStmt = $db->prepare('SELECT order_number FROM orders WHERE order_number=? AND email=?');
        $lookupStmt->execute([$lookupNumber, $lookupEmail]);
        $matchedOrder = $lookupStmt->fetchColumn();
        if (!$matchedOrder) {
            $lookupError = 'Nomor pesanan atau email tidak cocok. Silakan cek kembali.';
        } else {
            header('Location: order.php?number=' . urlencode((string)$matchedOrder));
            exit;
        }
    }
}
if (($_GET['poll'] ?? '') === '1') {
    header('Content-Type: application/json; charset=utf-8');
    if (!preg_match('/^RM-\d{6}-[A-F0-9]{32}$/',$number)) {
        http_response_code(404);
        echo json_encode(['error'=>'Pesanan tidak ditemukan.']);
        exit;
    }
    $poll=$db->prepare('SELECT status,shipping_carrier,tracking_number,tracking_url,updated_at FROM orders WHERE order_number=?');
    $poll->execute([$number]);
    $orderUpdate=$poll->fetch();
    if (!$orderUpdate) {
        http_response_code(404);
        echo json_encode(['error'=>'Pesanan tidak ditemukan.']);
        exit;
    }
    $orderUpdate['tracking_url']=safe_tracking_url($orderUpdate['tracking_url']);
    $orderUpdate['status_label']=order_status($orderUpdate['status']);
    echo json_encode($orderUpdate,JSON_THROW_ON_ERROR);
    exit;
}
$showLookup = ($number === '' || !preg_match('/^RM-\d{6}-[A-F0-9]{32}$/', $number));
$stmt = null;
if (!$showLookup) {
    $stmt = $db->prepare('SELECT * FROM orders WHERE order_number=?');
    $stmt->execute([$number]);
    $order = $stmt->fetch();
    if (!$order) {
        $showLookup = true;
        $lookupError = 'Pesanan tidak ditemukan. Silakan cek nomor pesanan Anda.';
    }
}
if ($showLookup) {
    $lookupNumber = $lookupNumber !== '' ? $lookupNumber : $number;
    $order = null;
} else {
    $trackingUrl=safe_tracking_url($order['tracking_url']);
    $orderBank=null;
    $bankCatalog=manual_bank_catalog();
    $bankCode=(string)($order['transfer_bank_code']??'');
    if($bankCode!==''&&isset($bankCatalog[$bankCode])&&$order['transfer_bank_account']!=='') {
        $orderBank=$bankCatalog[$bankCode]+[
            'account'=>$order['transfer_bank_account'],
            'holder'=>$order['transfer_account_name'],
        ];
    }
    $itemsStmt = $db->prepare('SELECT * FROM order_items WHERE order_id=?');
    $itemsStmt->execute([$order['id']]);
    $items = $itemsStmt->fetchAll();
    $reviewError='';
    $reviewNotice='';
}
if (!$showLookup && $_SERVER['REQUEST_METHOD']==='POST'&&($_POST['action']??'')==='submit_review') {
    verify_csrf();
    try {
        if($order['status']!=='completed') throw new RuntimeException('Ulasan dapat dikirim setelah pesanan berstatus Selesai.');
        $itemId=filter_var($_POST['order_item_id']??null,FILTER_VALIDATE_INT);
        $rating=filter_var($_POST['rating']??null,FILTER_VALIDATE_INT);
        $comment=trim((string)($_POST['comment']??''));
        if(!$itemId||!$rating||$rating<1||$rating>5) throw new RuntimeException('Pilih rating antara 1 sampai 5.');
        if(strlen($comment)<10||strlen($comment)>1000) throw new RuntimeException('Ulasan harus berisi 10–1.000 karakter.');
        $itemQuery=$db->prepare('SELECT id,product_id FROM order_items WHERE id=? AND order_id=?');
        $itemQuery->execute([$itemId,(int)$order['id']]);
        $reviewItem=$itemQuery->fetch();
        if(!$reviewItem||!$reviewItem['product_id']) throw new RuntimeException('Item pesanan tidak dapat diverifikasi sebagai album.');
        $existingReview=$db->prepare('SELECT id FROM product_reviews WHERE order_item_id=?');
        $existingReview->execute([$itemId]);
        if($existingReview->fetchColumn()) throw new RuntimeException('Ulasan untuk item ini sudah pernah dikirim.');
        $insertReview=$db->prepare("INSERT INTO product_reviews(order_id,order_item_id,product_id,rating,comment,status) VALUES(?,?,?,?,?,'pending')");
        $insertReview->execute([(int)$order['id'],$itemId,(int)$reviewItem['product_id'],$rating,$comment]);
        $reviewNotice='Terima kasih. Ulasan terverifikasi Anda menunggu moderasi toko.';
    } catch(Throwable $exception) {
        if($exception instanceof PDOException&&str_contains(strtolower($exception->getMessage()),'unique')) $reviewError='Ulasan untuk item ini sudah pernah dikirim.';
        else $reviewError=$exception->getMessage();
    }
}
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pesanan <?= h($number) ?> — <?= h(setting('company_name')) ?></title>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/brand.css">
<link rel="stylesheet" href="assets/record-room.css?v=<?= (int)filemtime(__DIR__ . '/assets/record-room.css') ?>">
<link rel="stylesheet" href="assets/payment.css">
<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#171915">
<script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script>
</head>
<body class="admin-body">
<header class="cart-page-header"><a class="brand" href="index.php"><?= logo_mark() ?></a></header>
<main class="order-page">
<?php if ($showLookup): ?>
    <span class="eyebrow">CEK STATUS PESANAN</span>
    <h1>Masukkan nomor pesanan Anda</h1>
    <p>Untuk melihat status, pelacakan, dan instruksi pembayaran, masukkan nomor pesanan serta email yang digunakan saat checkout.</p>
    <?php if ($lookupError !== ''): ?><div class="notice error"><?= h($lookupError) ?></div><?php endif ?>
    <form method="post" class="review-form lookup-form" style="max-width: 640px; margin-top: 1.5rem;">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <input type="hidden" name="action" value="lookup_order">
        <label>Nomor pesanan
            <input type="text" name="order_number" value="<?= h($lookupNumber) ?>" placeholder="RM-123456-ABCDEF1234567890ABCDEF1234" required>
        </label>
        <label>Email checkout
            <input type="email" name="email" placeholder="email@domain.com" required>
        </label>
        <button type="submit" class="button button-dark">Cek status pesanan</button>
    </form>
<?php else: ?>
<span class="eyebrow">PESANAN TERCATAT</span>
<h1>Terima kasih, <?= h($order['customer_name']) ?>.</h1>
<p>Nomor pesanan <strong><?= h($order['order_number']) ?></strong>. Simpan nomor ini untuk menanyakan status pesanan.</p>
<?php if(($_GET['payment']??'')==='unavailable'): ?><div class="notice error">Pesanan sudah tercatat dan stok diamankan, tetapi halaman pembayaran Midtrans belum berhasil dibuat. Jangan membuat pesanan baru; hubungi toko untuk bantuan pembayaran.</div><?php endif ?>
<section class="cart-summary">
<p><span>Status</span><strong><?= h(order_status($order['status'])) ?></strong></p>
<?php foreach($items as $item): ?><p><span><?= h($item['title']) ?> · <?= h($item['format']) ?> × <?= (int)$item['quantity'] ?></span><strong><?= money($item['unit_price']*$item['quantity']) ?></strong></p><?php endforeach ?>
<p><span>Subtotal</span><strong><?= money($order['subtotal']) ?></strong></p>
<p><span>Pengiriman</span><strong><?= $order['shipping']?money($order['shipping']):'Gratis' ?></strong></p>
<?php if($order['tracking_number']!==''): ?><p><span>Kurir</span><strong data-order-carrier><?= h($order['shipping_carrier']) ?></strong></p><p><span>Pelacakan</span><strong><a data-order-tracking href="<?= h($trackingUrl?:'#') ?>" target="_blank" rel="noopener noreferrer">Lacak paket · <?= h($order['tracking_number']) ?></a></strong></p><?php endif ?>
<p class="summary-total"><span>Total</span><strong><?= money($order['total']) ?></strong></p>
<?php if($order['payment_method']==='bank_transfer'): ?>
<div class="payment-instructions"><h2>Instruksi transfer</h2><p>Transfer tepat sejumlah <strong><?= money($order['total']) ?></strong> ke rekening berikut:</p><?php if($orderBank): ?><div class="payment-bank-summary"><img src="<?= h($orderBank['logo']) ?>" alt="Logo <?= h($orderBank['name']) ?>"><p><strong><?= h($orderBank['name']) ?></strong><br><?= h($orderBank['account']) ?><br>a.n. <?= h($orderBank['holder']) ?></p></div><small>Admin akan memverifikasi pembayaran secara manual.</small><?php else: ?><p>Detail rekening untuk pesanan ini tidak tersimpan. Hubungi toko untuk mengonfirmasi rekening yang berlaku sebelum transfer.</p><?php endif ?></div>
<?php elseif($order['payment_method']==='midtrans'): ?>
<div class="payment-instructions"><h2>Pembayaran Midtrans</h2><?php if($order['payment_url']!==''): ?><p>Pembayaran aman diproses melalui Midtrans. Selesaikan pembayaran agar pesanan dapat segera disiapkan.</p><a class="button button-dark" href="<?= h($order['payment_url']) ?>" target="_blank" rel="noopener noreferrer">Lanjutkan pembayaran</a><?php else: ?><p>Halaman pembayaran belum tersedia. Hubungi toko dan cantumkan nomor pesanan di atas.</p><?php endif ?></div>
<?php else: ?>
<div class="payment-instructions"><h2>Pembayaran COD</h2><p>Pesanan menunggu konfirmasi toko. Tim kami akan menghubungi <?= h($order['phone']) ?> terkait ketersediaan layanan COD.</p></div>
<?php endif ?>
</section>
<?php if($order['status']==='completed'): ?><section class="order-review-section"><h2>Bagikan pengalaman belanja</h2><p>Ulasan hanya dapat dikirim untuk item di pesanan selesai ini. Ulasan akan ditinjau toko sebelum tampil di halaman album.</p><?php if($reviewNotice): ?><div class="notice success"><?= h($reviewNotice) ?></div><?php endif ?><?php if($reviewError): ?><div class="notice error"><?= h($reviewError) ?></div><?php endif ?><?php foreach($items as $item): if(!$item['product_id']) continue; $reviewCheck=$db->prepare('SELECT status FROM product_reviews WHERE order_item_id=?');$reviewCheck->execute([(int)$item['id']]);$existingStatus=$reviewCheck->fetchColumn(); ?><article class="order-review-item"><h3><?= h($item['title']) ?> · <?= h($item['format']) ?></h3><?php if($existingStatus): ?><p><?= $existingStatus==='published'?'Ulasan Anda sudah ditampilkan.':'Ulasan sudah dikirim dan menunggu moderasi.' ?></p><?php else: ?><form method="post" class="review-form"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="action" value="submit_review"><input type="hidden" name="order_item_id" value="<?= (int)$item['id'] ?>"><label>Rating<select name="rating" required><option value="">Pilih rating</option><?php for($stars=5;$stars>=1;$stars--): ?><option value="<?= $stars ?>"><?= $stars ?> dari 5 bintang</option><?php endfor ?></select></label><label>Ulasan<textarea name="comment" minlength="10" maxlength="1000" rows="4" required placeholder="Bagaimana kondisi dan pengalaman belanjanya?"></textarea></label><button class="button button-dark">Kirim ulasan</button></form><?php endif ?></article><?php endforeach ?></section><?php endif ?>
<a class="button button-dark" href="index.php">Kembali ke toko</a>
<?php endif ?>
</main>
<script src="assets/app.js" defer></script>
</body>
</html>
