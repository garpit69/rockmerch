<?php
require __DIR__ . '/bootstrap.php';

$productId=filter_var($_GET['id']??null,FILTER_VALIDATE_INT);
$stmt=$db->prepare("SELECT * FROM products WHERE id=? AND status='published' AND merchandise=0");
$stmt->execute([$productId?:0]);
$product=$stmt->fetch();
if(!$product) {
    http_response_code(404);
    exit('Album tidak ditemukan.');
}
$formats=json_decode($product['formats']?:'[]',true,512,JSON_THROW_ON_ERROR);
$images=json_decode($product['images']?:'[]',true)?:[];
$cover=$images[0]??'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=1000&q=85';
$stockTotal=0;
foreach($formats as $format) $stockTotal+=max(0,(int)($format['stock']??0));
$selectedFormatIndex=null;
foreach($formats as $index=>$format) if((int)($format['stock']??0)>0) {$selectedFormatIndex=$index;break;}
$conditionNotes=[
    'Baru'=>'Belum pernah dipakai.',
    'Mint'=>'Kondisi nyaris sempurna; tidak terlihat cacat berarti.',
    'VG+'=>'Sangat baik; mungkin ada tanda pemakaian ringan yang tidak mengganggu pemutaran.',
    'VG'=>'Baik; tanda pemakaian terlihat dan dapat ada noise ringan.',
    'Good'=>'Pernah dipakai cukup lama; tanda pemakaian jelas, namun rilisan tetap dapat dinikmati.',
];
$conditionNote=$conditionNotes[$product['condition_name']]??'Kondisi rilisan dicantumkan sesuai pemeriksaan toko.';
$ratingQuery=$db->prepare("SELECT COUNT(*) AS review_count,COALESCE(AVG(r.rating),0) AS average_rating FROM product_reviews r JOIN orders o ON o.id=r.order_id WHERE r.product_id=? AND r.status='published' AND o.status='completed'");
$ratingQuery->execute([(int)$product['id']]);
$ratingSummary=$ratingQuery->fetch();
$reviewQuery=$db->prepare("SELECT r.rating,r.comment,r.created_at FROM product_reviews r JOIN orders o ON o.id=r.order_id WHERE r.product_id=? AND r.status='published' AND o.status='completed' ORDER BY r.created_at DESC LIMIT 30");
$reviewQuery->execute([(int)$product['id']]);
$reviews=$reviewQuery->fetchAll();
$averageRating=(float)$ratingSummary['average_rating'];
$relatedQuery=$db->prepare("SELECT id,title,artist,images,formats FROM products WHERE status='published' AND merchandise=0 AND id<>? AND (genre=? OR artist=?) ORDER BY featured DESC,id DESC LIMIT 4");
$relatedQuery->execute([(int)$product['id'],$product['genre'],$product['artist']]);
$relatedProducts=$relatedQuery->fetchAll();
$whatsapp=whatsapp_url('Halo, saya ingin bertanya tentang '.$product['artist'].' — '.$product['title'].'.');
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($product['artist']) ?> — <?= h($product['title']) ?> | <?= h(setting('company_name')) ?></title>
<meta name="description" content="<?= h($product['description']?:$product['artist'].' — '.$product['title'].' tersedia dalam format Kaset, CD, dan Vinyl di '.setting('company_name').'.') ?>">
<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#171915"><link rel="stylesheet" href="assets/style.css"><link rel="stylesheet" href="assets/brand.css"><link rel="stylesheet" href="assets/record-room.css?v=<?= (int)filemtime(__DIR__ . '/assets/record-room.css') ?>"><script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script>
</head>
<body data-csrf="<?= h(csrf_token()) ?>">
<header class="site-header"><a class="brand" href="index.php"><?= logo_mark() ?></a><button class="menu-toggle" aria-label="Buka menu" aria-expanded="false">Menu</button><nav class="main-nav"><a href="shop.php">Katalog</a><a href="company.php">Tentang Kami</a><a href="policies.php">Info belanja</a></nav><div class="header-tools"><button class="icon-btn theme-toggle" aria-label="Ganti tema">Tema</button><a class="icon-btn cart-trigger" href="cart.php">Keranjang <i><?= cart_item_count() ?></i></a></div></header>
<main class="product-detail-page">
<a class="back-link" href="shop.php">← Kembali ke katalog</a>
<section class="product-detail">
<div class="product-detail-cover"><img src="<?= h($cover) ?>" alt="Sampul <?= h($product['title']) ?> oleh <?= h($product['artist']) ?>"></div>
<article class="product-detail-copy product-card" data-product-id="<?= (int)$product['id'] ?>" data-condition="<?= h($product['condition_name']) ?>">
<span class="eyebrow"><?= h($product['genre']) ?><?= $product['year']!==''?' · '.h($product['year']):'' ?></span>
<h1><?= h($product['title']) ?></h1><p class="product-artist"><?= h($product['artist']) ?></p>
<p class="product-meta"><?= h($product['label']) ?><?= $product['label']!==''?' · ':'' ?>Kondisi: <?= h($product['condition_name']) ?></p>
<?php if((int)$ratingSummary['review_count']>0): ?><p class="product-rating" aria-label="Rating rata-rata <?= number_format($averageRating,1) ?> dari 5"><?= str_repeat('★',(int)round($averageRating)) ?><?= str_repeat('☆',5-(int)round($averageRating)) ?> <strong><?= number_format($averageRating,1) ?>/5</strong> · <?= (int)$ratingSummary['review_count'] ?> ulasan terverifikasi</p><?php else: ?><p class="product-rating">Belum ada ulasan terverifikasi.</p><?php endif ?>
<?php if($product['description']!==''): ?><p class="product-description"><?= nl2br(h($product['description'])) ?></p><?php endif ?>
<div class="format-tabs" role="tablist" aria-label="Pilih format <?= h($product['title']) ?>"><?php foreach($formats as $i=>$format): ?><button class="<?= $i===$selectedFormatIndex?'selected':'' ?>" data-price="<?= (int)$format['price'] ?>" data-format="<?= h($format['format']) ?>" <?= (int)$format['stock']<1?'disabled':'' ?> role="tab"><?= h($format['format']) ?><?= (int)$format['stock']<1?' (habis)':'' ?></button><?php endforeach ?></div>
<ul class="format-stock-list"><?php foreach($formats as $format): ?><li><span><?= h($format['format']) ?></span><strong><?= money((int)$format['price']) ?></strong><small><?= (int)$format['stock']>0?'Stok: '.(int)$format['stock'].' unit':'Stok habis' ?></small></li><?php endforeach ?></ul>
<span class="product-condition">Total stok semua format: <?= $stockTotal ?> unit · Kondisi: <?= h($product['condition_name']) ?></span><small class="condition-description"><?= h($conditionNote) ?></small>
<div class="product-bottom"><button class="add-cart" data-title="<?= h($product['title']) ?>" data-id="<?= (int)$product['id'] ?>" <?= $stockTotal===0?'disabled':'' ?>>Tambah ke keranjang</button><?php if($whatsapp!==''): ?><a class="button button-outline" href="<?= h($whatsapp) ?>" target="_blank" rel="noopener noreferrer">Tanya via WhatsApp</a><?php endif ?></div>
</article>
</section>
<?php if($product['tracklist']!==''): ?><section class="detail-section"><span class="eyebrow">TRACKLIST</span><h2>Sisi A, sisi B.</h2><div class="tracklist"><?= nl2br(h($product['tracklist'])) ?></div></section><?php endif ?>
<section class="detail-section review-section"><span class="eyebrow">DARI PARA PENDENGAR</span><h2>Ulasan pembeli</h2><?php if(!$reviews): ?><p>Ulasan dari pesanan selesai akan muncul di sini setelah dimoderasi toko.</p><?php else: ?><div class="review-grid"><?php foreach($reviews as $review): ?><article class="review-card"><strong><?= str_repeat('★',(int)$review['rating']) ?><?= str_repeat('☆',5-(int)$review['rating']) ?></strong><p><?= nl2br(h($review['comment'])) ?></p><small>Pembelian terverifikasi · <?= h(date('d M Y',strtotime($review['created_at']))) ?></small></article><?php endforeach ?></div><?php endif ?><p class="review-note">Form ulasan tersedia di halaman pesanan setelah statusnya Selesai. Ulasan yang dikirim ditinjau sebelum ditampilkan.</p></section>
<?php if($relatedProducts): ?><section class="detail-section related-section"><span class="eyebrow">MASIH SATU VIBE</span><h2>Album terkait</h2><div class="related-grid"><?php foreach($relatedProducts as $related): $relatedImages=json_decode($related['images']?:'[]',true)?:[]; ?><a class="related-card" href="product.php?id=<?= (int)$related['id'] ?>"><img src="<?= h($relatedImages[0]??$cover) ?>" alt="Sampul <?= h($related['title']) ?>" loading="lazy"><strong><?= h($related['title']) ?></strong><span><?= h($related['artist']) ?></span></a><?php endforeach ?></div></section><?php endif ?>
</main>
<footer class="footer"><div class="footer-bottom"><span>© <?= date('Y') ?> <?= h(setting('company_name')) ?></span><a href="policies.php">Informasi belanja</a><a href="shop.php">Kembali ke katalog</a></div></footer>
<div class="mini-cart" aria-live="polite"><button class="cart-close" aria-label="Tutup">Tutup</button><span class="eyebrow">KERANJANG</span><p class="cart-message"></p><a class="button button-dark" href="cart.php">Lihat keranjang</a></div>
<script src="assets/app.js" defer></script>
</body></html>
