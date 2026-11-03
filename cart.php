<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(419);
        echo json_encode(['error' => 'Sesi kedaluwarsa. Muat ulang halaman.']);
        exit;
    }
    $action = $_POST['action'] ?? 'add';
    $key = (string)($_POST['key'] ?? '');
    if ($action === 'remove') {
        unset($_SESSION['cart'][$key]);
        echo json_encode(['count' => cart_item_count()]);
        exit;
    }
    if ($action === 'quantity') {
        $quantity = filter_var($_POST['quantity'] ?? null, FILTER_VALIDATE_INT);
        $line = cart_lines()[$key] ?? null;
        if (!$line || !$quantity || $quantity < 1 || $quantity > $line['stock']) {
            http_response_code(409);
            echo json_encode(['error' => 'Jumlah melebihi stok yang tersedia.']);
            exit;
        }
        $_SESSION['cart'][$key]['quantity'] = $quantity;
        echo json_encode(['count' => cart_item_count()]);
        exit;
    }
    $id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $db->prepare("SELECT id,title,formats FROM products WHERE id=? AND status='published'");
    $stmt->execute([$id ?: 0]);
    $product = $stmt->fetch();
    if (!$product) {
        http_response_code(404);
        echo json_encode(['error' => 'Rilisan ini sedang tidak tersedia.']);
        exit;
    }
    $selected = null;
    foreach (json_decode($product['formats'] ?: '[]', true) ?: [] as $format) {
        if (($format['format'] ?? '') === (string)($_POST['format'] ?? '') && (int)$format['stock'] > 0) {
            $selected = $format;
            break;
        }
    }
    if (!$selected) {
        http_response_code(409);
        echo json_encode(['error' => 'Format ini sedang habis.']);
        exit;
    }
    $key = $product['id'] . '|' . rawurlencode($selected['format']);
    $currentQuantity = (int)($_SESSION['cart'][$key]['quantity'] ?? 0);
    if ($currentQuantity >= (int)$selected['stock']) {
        http_response_code(409);
        echo json_encode(['error' => 'Stok tidak mencukupi untuk menambah jumlah ini.']);
        exit;
    }
    $_SESSION['cart'][$key] = ['product_id' => (int)$product['id'], 'format' => $selected['format'], 'quantity' => $currentQuantity + 1];
    echo json_encode(['count' => cart_item_count(), 'title' => $product['title'], 'format' => $selected['format'], 'key' => $key]);
    exit;
}

$lines = cart_lines();
$subtotal = array_sum(array_map(static fn($line) => $line['price'] * $line['quantity'], $lines));
$shipping = $subtotal >= (int)setting('free_shipping') ? 0 : (int)setting('shipping_fee');
?>
<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Keranjang — <?= h(setting('company_name')) ?></title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#171915"><link rel="stylesheet" href="assets/style.css"><link rel="stylesheet" href="assets/brand.css"><link rel="stylesheet" href="assets/record-room.css?v=<?= (int)filemtime(__DIR__ . '/assets/record-room.css') ?>"><script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script></head>
<body class="admin-body"><header class="cart-page-header"><a class="brand" href="index.php"><?= logo_mark() ?></a><button class="icon-btn theme-toggle" aria-label="Ganti tema">Tema</button></header>
<main class="cart-page"><a class="back-link" href="shop.php">Kembali ke katalog</a><h1>Keranjang belanja</h1>
<?php if (!$lines): ?><section class="empty-state"><h2>Keranjang masih kosong.</h2><p>Pilih rilisan dari katalog untuk mulai belanja.</p><a class="button button-dark" href="shop.php">Lihat katalog</a></section>
<?php else: ?><div class="cart-layout"><div class="cart-lines"><?php foreach ($lines as $line): ?><article class="cart-line"><img src="<?= h($line['image']) ?>" alt="Sampul <?= h($line['title']) ?>"><div class="cart-line-info"><h2><?= h($line['title']) ?></h2><p><?= h($line['artist']) ?> · <?= h($line['format']) ?></p><small><?= money($line['price']) ?> per item · stok <?= $line['stock'] ?></small></div><label>Jumlah<select data-cart-quantity data-key="<?= h($line['key']) ?>"><?php for($i=1;$i<=min(10,$line['stock']);$i++): ?><option value="<?= $i ?>" <?= $line['quantity']===$i?'selected':'' ?>><?= $i ?></option><?php endfor ?></select></label><strong><?= money($line['price']*$line['quantity']) ?></strong><button class="text-button" data-cart-remove data-key="<?= h($line['key']) ?>">Hapus</button></article><?php endforeach ?></div><aside class="cart-summary"><h2>Ringkasan pesanan</h2><p><span>Subtotal</span><strong><?= money($subtotal) ?></strong></p><p><span>Ongkir</span><strong><?= $shipping ? money($shipping) : 'Gratis' ?></strong></p><p class="summary-total"><span>Total sementara</span><strong><?= money($subtotal+$shipping) ?></strong></p><?php if($shipping): ?><small>Tambah belanja <?= money((int)setting('free_shipping')-$subtotal) ?> untuk gratis ongkir.</small><?php endif ?><a class="button button-dark full-width" href="checkout.php">Lanjut ke checkout</a></aside></div><?php endif ?></main>
<script src="assets/app.js" defer></script></body></html>
