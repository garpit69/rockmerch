<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');
$lines = cart_lines();
$error = '';
if (!$lines) {
    header('Location: cart.php');
    exit;
}
$subtotal = array_sum(array_map(static fn($line) => $line['price'] * $line['quantity'], $lines));
$shipping = $subtotal >= (int)setting('free_shipping') ? 0 : (int)setting('shipping_fee');
$orderNumber = '';
$manualBanks = manual_bank_accounts();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        verify_csrf();
        foreach (['customer_name','email','phone','address','city','postal_code'] as $field) {
            if (trim((string)($_POST[$field] ?? '')) === '') throw new RuntimeException('Lengkapi semua kolom wajib untuk pengiriman.');
        }
        $customerEmail = strtolower(trim((string)$_POST['email']));
        if (!filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Format email tidak valid.');
        $customerName = trim((string)$_POST['customer_name']);
        $phone = trim((string)$_POST['phone']);
        $address = trim((string)$_POST['address']);
        $city = trim((string)$_POST['city']);
        $postalCode = trim((string)$_POST['postal_code']);
        $notes = trim((string)($_POST['notes'] ?? ''));
        if (strlen($customerName) > 160 || strlen($phone) > 40 || strlen($address) > 1000 || strlen($city) > 120 || strlen($postalCode) > 20 || strlen($notes) > 1000) {
            throw new RuntimeException('Ada kolom yang melebihi panjang maksimum. Periksa kembali data pengiriman.');
        }
        $paymentMethod=(string)($_POST['payment_method']??'');
        if (!in_array($paymentMethod, ['bank_transfer','cod','midtrans'], true)) throw new RuntimeException('Pilih metode pembayaran yang tersedia.');
        if($paymentMethod==='midtrans'&&setting('midtrans_server_key')==='') throw new RuntimeException('Pembayaran online belum dikonfigurasi. Pilih metode lain yang tersedia.');
        $transferBank=null;
        if($paymentMethod==='bank_transfer') {
            $bankCode=(string)($_POST['bank_code']??'');
            $transferBank=$manualBanks[$bankCode]??null;
            if(!$transferBank) throw new RuntimeException('Pilih rekening bank yang aktif atau gunakan metode pembayaran lain.');
        }
        $currentLines = cart_lines();
        if (!$currentLines) throw new RuntimeException('Keranjang kosong. Tambahkan produk sebelum checkout.');
        $subtotal = array_sum(array_map(static fn($line) => $line['price'] * $line['quantity'], $currentLines));
        $shipping = $subtotal >= (int)setting('free_shipping') ? 0 : (int)setting('shipping_fee');
        $orderNumber = 'RM-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(16)));
        $db->exec('BEGIN IMMEDIATE');
        $orderStatus = $paymentMethod === 'cod' ? 'awaiting_confirmation' : 'awaiting_payment';
        $insert = $db->prepare('INSERT INTO orders (order_number,customer_name,email,phone,address,city,postal_code,notes,subtotal,shipping,total,payment_method,status,transfer_bank_code,transfer_bank_account,transfer_account_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $insert->execute([$orderNumber,$customerName,$customerEmail,$phone,$address,$city,$postalCode,$notes,$subtotal,$shipping,$subtotal+$shipping,$paymentMethod,$orderStatus,$transferBank['code']??'',$transferBank['account']??'',$transferBank['holder']??'']);
        $orderId = (int)$db->lastInsertId();
        $updateProduct = $db->prepare('UPDATE products SET formats=? WHERE id=?');
        $addItem = $db->prepare('INSERT INTO order_items (order_id,product_id,title,format,unit_price,quantity) VALUES (?,?,?,?,?,?)');
        foreach ($currentLines as $line) {
            $productQuery = $db->prepare('SELECT formats,status FROM products WHERE id=?');
            $productQuery->execute([$line['product_id']]);
            $product = $productQuery->fetch();
            if (!$product || $product['status'] !== 'published') throw new RuntimeException('Salah satu rilisan sudah tidak tersedia.');
            $formats = json_decode($product['formats'] ?: '[]', true) ?: [];
            $found = false;
            foreach ($formats as &$format) {
                if ($format['format'] !== $line['format']) continue;
                $found = true;
                if ((int)$format['stock'] < $line['quantity']) throw new RuntimeException('Stok ' . $line['title'] . ' (' . $line['format'] . ') tidak cukup. Perbarui jumlah di keranjang.');
                $format['stock'] = (int)$format['stock'] - $line['quantity'];
                break;
            }
            unset($format);
            if (!$found) throw new RuntimeException('Format ' . $line['format'] . ' sudah tidak tersedia.');
            $updateProduct->execute([json_encode($formats),$line['product_id']]);
            $addItem->execute([$orderId,$line['product_id'],$line['title'],$line['format'],$line['price'],$line['quantity']]);
        }
        queue_order_notification($db, $orderId, 'received');
        $db->exec('COMMIT');
        $paymentUnavailable=false;
        if($paymentMethod==='midtrans') {
            try {
                $itemsQuery=$db->prepare('SELECT product_id,title,format,unit_price,quantity FROM order_items WHERE order_id=?');
                $itemsQuery->execute([$orderId]);
                $paymentOrder=[
                    'order_number'=>$orderNumber,
                    'total'=>$subtotal+$shipping,
                    'shipping'=>$shipping,
                    'customer_name'=>$customerName,
                    'email'=>$customerEmail,
                    'phone'=>$phone,
                    'address'=>$address,
                    'city'=>$city,
                    'postal_code'=>$postalCode,
                ];
                $snap=midtrans_snap_transaction($paymentOrder,$itemsQuery->fetchAll());
                $savePayment=$db->prepare('UPDATE orders SET payment_url=?,payment_transaction_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
                $savePayment->execute([$snap['redirect_url'],$snap['transaction_id'],$orderId]);
            } catch(Throwable $paymentException) {
                error_log('Midtrans payment session creation failed for order '.$orderNumber.': '.$paymentException->getMessage());
                $paymentUnavailable=true;
            }
        }
        $_SESSION['cart'] = [];
        $_SESSION['last_order'] = $orderNumber;
        header('Location: order.php?number=' . urlencode($orderNumber).($paymentUnavailable?'&payment=unavailable':''));
        exit;
    } catch (Throwable $exception) {
        if ($db->inTransaction()) $db->rollBack();
        else {
            try { $db->exec('ROLLBACK'); } catch (Throwable) {}
        }
        $error = $exception->getMessage();
        $lines = cart_lines();
        $subtotal = array_sum(array_map(static fn($line) => $line['price'] * $line['quantity'], $lines));
        $shipping = $subtotal >= (int)setting('free_shipping') ? 0 : (int)setting('shipping_fee');
    }
}
$selectedPaymentMethod=(string)($_POST['payment_method']??($manualBanks?'bank_transfer':(setting('midtrans_server_key')!==''?'midtrans':'cod')));
$selectedBankCode=(string)($_POST['bank_code']??array_key_first($manualBanks)??'');
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout — <?= h(setting('company_name')) ?></title>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/brand.css">
<link rel="stylesheet" href="assets/record-room.css?v=<?= (int)filemtime(__DIR__ . '/assets/record-room.css') ?>">
<link rel="stylesheet" href="assets/payment.css">
<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#171915">
<script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script>
</head>
<body class="admin-body">
<header class="cart-page-header"><a class="brand" href="index.php"><?= logo_mark() ?></a></header>
<main class="checkout-page">
<a class="back-link" href="cart.php">Kembali ke keranjang</a><h1>Detail pengiriman</h1>
<?php if($error): ?><div class="notice error"><?= h($error) ?></div><?php endif ?>
<div class="checkout-layout">
<form method="post" class="checkout-form">
<input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
<div class="form-grid">
<label>Nama penerima *<input name="customer_name" required value="<?= h($_POST['customer_name'] ?? '') ?>"></label>
<label>Email *<input type="email" name="email" required value="<?= h($_POST['email'] ?? '') ?>"></label>
<label>Nomor WhatsApp *<input name="phone" type="tel" required value="<?= h($_POST['phone'] ?? '') ?>"></label>
<label>Kode pos *<input name="postal_code" required value="<?= h($_POST['postal_code'] ?? '') ?>"></label>
<label class="span-2">Alamat lengkap *<textarea name="address" required rows="3"><?= h($_POST['address'] ?? '') ?></textarea></label>
<label>Kota / Kabupaten *<input name="city" required value="<?= h($_POST['city'] ?? '') ?>"></label>
<label>Catatan untuk toko<textarea name="notes" rows="2"><?= h($_POST['notes'] ?? '') ?></textarea></label>
</div>
<fieldset>
<legend>Metode pembayaran</legend>
<?php if($manualBanks): ?><div class="bank-transfer-choice"><label class="payment-option"><input type="radio" name="payment_method" value="bank_transfer" <?= $selectedPaymentMethod==='bank_transfer'?'checked':'' ?>><span><strong>Transfer bank manual</strong><small>Admin memverifikasi pembayaran setelah transfer.</small></span></label><div class="bank-options" role="group" aria-label="Pilih rekening tujuan"><?php foreach($manualBanks as $code=>$bank): ?><label class="bank-option"><input type="radio" name="bank_code" value="<?= h($code) ?>" <?= $selectedBankCode===$code?'checked':'' ?>><img src="<?= h($bank['logo']) ?>" alt="Logo <?= h($bank['name']) ?>"><span><strong><?= h($bank['name']) ?></strong><small><?= h($bank['account']) ?><br>a.n. <?= h($bank['holder']) ?></small></span></label><?php endforeach ?></div></div><?php else: ?><p class="checkout-note">Transfer bank belum tersedia. Toko perlu mengisi nomor dan nama pemilik rekening di pengaturan pembayaran.</p><div class="bank-options bank-options-unavailable" aria-label="Bank yang dapat diaktifkan"><?php foreach(manual_bank_catalog() as $bank): ?><div class="bank-option bank-option-disabled"><img src="<?= h($bank['logo']) ?>" alt="Logo <?= h($bank['name']) ?>"><span><strong><?= h($bank['name']) ?></strong><small>Rekening toko belum dikonfigurasi</small></span></div><?php endforeach ?></div><?php endif ?>
<?php if(setting('midtrans_server_key')!==''): ?><label class="payment-option"><input type="radio" name="payment_method" value="midtrans" <?= $selectedPaymentMethod==='midtrans'?'checked':'' ?>><span><strong>Pembayaran online · Midtrans</strong><small>Bayar melalui metode yang tersedia di halaman pembayaran aman Midtrans.</small></span></label><?php endif ?>
<label class="payment-option"><input type="radio" name="payment_method" value="cod" <?= $selectedPaymentMethod==='cod'?'checked':'' ?>><span><strong>Bayar saat diterima (COD)</strong><small>Pesanan menunggu konfirmasi area layanan dari toko.</small></span></label>
</fieldset>
<p class="checkout-note"><?= setting('midtrans_server_key')!==''?'Halaman pembayaran online dibuat setelah pesanan tercatat. Stok diamankan saat checkout.':($manualBanks?'Transfer manual dan COD tersedia.':'Saat ini COD tersedia. Stok diamankan saat checkout.') ?></p>
<button class="button button-dark">Buat pesanan · <?= money($subtotal+$shipping) ?></button>
</form>
<aside class="cart-summary">
<h2>Pesananmu</h2>
<?php foreach($lines as $line): ?><p><span><?= h($line['title']) ?> (<?= h($line['format']) ?>) × <?= $line['quantity'] ?></span><strong><?= money($line['price']*$line['quantity']) ?></strong></p><?php endforeach ?>
<p><span>Subtotal</span><strong><?= money($subtotal) ?></strong></p>
<p><span>Pengiriman</span><strong><?= $shipping ? money($shipping) : 'Gratis' ?></strong></p>
<p class="summary-total"><span>Total</span><strong><?= money($subtotal+$shipping) ?></strong></p>
</aside>
</div>
</main>
<script src="assets/app.js?v=<?= (int)filemtime(__DIR__ . '/assets/app.js') ?>" defer></script>
</body>
</html>
