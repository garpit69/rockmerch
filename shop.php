<?php
require __DIR__ . '/bootstrap.php';
if (($_GET['ajax'] ?? '') === 'stock') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    $stockRows=$db->query("SELECT id,formats FROM products WHERE status='published'")->fetchAll();
    $stockData=[];
    foreach($stockRows as $row) {
        $stockData[(string)$row['id']]=json_decode($row['formats'] ?: '[]',true) ?: [];
    }
    echo json_encode($stockData,JSON_THROW_ON_ERROR);
    exit;
}
$query = trim(substr((string)($_GET['q'] ?? ''), 0, 100));
$format = trim((string)($_GET['format'] ?? ''));
$genre = trim((string)($_GET['genre'] ?? ''));
$sort = (string)($_GET['sort'] ?? 'newest');
$sortSql = ['price_asc'=>'price_asc','price_desc'=>'price_desc','title'=>'title'][$sort] ?? 'newest';
$genres = $db->query("SELECT DISTINCT genre FROM products WHERE status='published' AND genre<>'' ORDER BY genre")->fetchAll(PDO::FETCH_COLUMN);
if ($query !== '') {
    $lastQuery = $_SESSION['last_search'] ?? '';
    if ($lastQuery !== $query) {
        $stmt = $db->prepare('INSERT INTO search_terms (term,searched_at) VALUES (?,?)');
        $stmt->execute([$query,time()]);
        $_SESSION['last_search'] = $query;
    }
}
$products = $db->query("SELECT * FROM products WHERE status='published' ORDER BY id DESC")->fetchAll();
$products = array_values(array_filter($products,static function($product) use ($query,$format,$genre) {
    $formats = json_decode($product['formats'] ?: '[]',true) ?: [];
    $matchesFormat = $format === '' || in_array($format,array_column($formats,'format'),true);
    $matchesGenre = $genre === '' || $product['genre'] === $genre;
    $matchesQuery = $query === '' || stripos($product['title'].' '.$product['artist'].' '.$product['genre'],$query)!==false;
    return $matchesFormat && $matchesGenre && $matchesQuery;
}));
if ($sortSql !== 'newest') {
    usort($products,static function($a,$b) use ($sortSql) {
        if ($sortSql === 'title') return strcasecmp($a['title'],$b['title']);
        $priceA = min(array_column(json_decode($a['formats'] ?: '[]',true) ?: [],'price') ?: [0]);
        $priceB = min(array_column(json_decode($b['formats'] ?: '[]',true) ?: [],'price') ?: [0]);
        return $sortSql === 'price_asc' ? $priceA <=> $priceB : $priceB <=> $priceA;
    });
}
foreach ($products as $product) {
    $id = (int)$product['id'];
    if ((int)($_SESSION['viewed_products'][$id] ?? 0) < time()-86400) {
        $stmt = $db->prepare('INSERT INTO product_views (product_id,viewed_at) VALUES (?,?)');
        $stmt->execute([$id,time()]);
        $_SESSION['viewed_products'][$id] = time();
    }
}
function catalog_image(array $product,int $index=0): string {
    $images = json_decode($product['images'] ?: '[]',true) ?: [];
    return $images[$index] ?? $images[0] ?? 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=700&q=85';
}
function catalog_price(array $product): int {
    return min(array_column(json_decode($product['formats'] ?: '[]',true) ?: [],'price') ?: [0]);
}
?>
<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Katalog — <?= h(setting('company_name')) ?></title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#171915"><link rel="stylesheet" href="assets/style.css"><link rel="stylesheet" href="assets/brand.css"><link rel="stylesheet" href="assets/record-room.css?v=<?= (int)filemtime(__DIR__ . '/assets/record-room.css') ?>"><script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script></head><body data-csrf="<?= h(csrf_token()) ?>">
<header class="site-header" id="site-header"><a class="brand" href="index.php"><?= logo_mark() ?></a><button class="menu-toggle" aria-label="Buka menu" aria-expanded="false">Menu</button><nav class="main-nav"><a href="shop.php">Katalog</a><a href="company.php">Tentang Kami</a><a href="policies.php">Info belanja</a><a href="index.php#club">Record Club</a><a href="index.php#contact">Contact</a></nav><div class="header-tools"><button class="icon-btn theme-toggle" aria-label="Ganti tema">Tema</button><a class="icon-btn cart-trigger" href="cart.php" aria-label="Keranjang">Keranjang <i><?= cart_item_count() ?></i></a></div></header>
<main class="catalog-page"><div class="catalog-intro"><span class="eyebrow">VINYL · KASET · CD</span><h1>Temukan giliran<br>untuk diputar.</h1><p>Jelajahi semua rilisan di rak. Cari album, artis, atau genre yang sedang kamu cari.</p></div>
<form class="catalog-filters" method="get"><label class="catalog-search">Cari rilisan<input type="search" name="q" value="<?= h($query) ?>" placeholder="Nama album, artis, genre"></label><label>Format<select name="format"><option value="">Semua format</option><?php foreach(['Vinyl','Kaset','CD','Merchandise'] as $option): ?><option value="<?= h($option) ?>" <?= $format===$option?'selected':'' ?>><?= h($option) ?></option><?php endforeach ?></select></label><label>Genre<select name="genre"><option value="">Semua genre</option><?php foreach($genres as $option): ?><option value="<?= h($option) ?>" <?= $genre===$option?'selected':'' ?>><?= h($option) ?></option><?php endforeach ?></select></label><label>Urutkan<select name="sort"><option value="newest" <?= $sort==='newest'?'selected':'' ?>>Terbaru</option><option value="price_asc" <?= $sort==='price_asc'?'selected':'' ?>>Harga terendah</option><option value="price_desc" <?= $sort==='price_desc'?'selected':'' ?>>Harga tertinggi</option><option value="title" <?= $sort==='title'?'selected':'' ?>>Nama album</option></select></label><button class="button button-dark">Terapkan</button><a class="filter-reset" href="shop.php">Reset</a></form>
<div class="catalog-result"><span><?= count($products) ?> rilisan ditemukan</span><?php if($query!==''): ?><span>Pencarian: “<?= h($query) ?>”</span><?php endif ?></div>
<?php if(!$products): ?><section class="empty-state"><h2>Belum ada rilisan yang cocok.</h2><p>Coba kata pencarian atau filter yang berbeda.</p><a href="shop.php" class="button button-outline">Reset filter</a></section><?php else: ?>
<div class="product-grid catalog-grid"><?php foreach($products as $product): $formats=json_decode($product['formats'] ?: '[]',true) ?: []; $stock=array_sum(array_map(static fn($f)=>(int)$f['stock'],$formats)); $firstAvailable=null;foreach($formats as $formatIndex=>$formatItem)if((int)$formatItem['stock']>0){$firstAvailable=$formatIndex;break;} ?><article class="product-card" data-reveal><button class="product-art quick-view" data-product="<?= (int)$product['id'] ?>" aria-label="Lihat cepat <?= h($product['title']) ?>"><img class="cover-front" src="<?= h(catalog_image($product)) ?>" alt="Sampul album <?= h($product['title']) ?>" loading="lazy"><img class="cover-back" src="<?= h(catalog_image($product,1)) ?>" alt="" loading="lazy"><span class="record-disc"></span><?php if($product['badge']): ?><span class="badge"><?= h($product['badge']==='New'?'Baru':$product['badge']) ?></span><?php endif ?><?php if($stock===0): ?><span class="badge badge-sold">Habis</span><?php endif ?><span class="quick-label">Detail rilisan</span></button><div class="format-tabs" role="tablist" aria-label="Format <?= h($product['title']) ?>"><?php foreach($formats as $i=>$f): ?><button class="<?= $i===$firstAvailable?'selected':'' ?>" data-price="<?= (int)$f['price'] ?>" data-format="<?= h($f['format']) ?>" <?= (int)$f['stock']<1?'disabled':'' ?> role="tab"><?= h($f['format']) ?><?= (int)$f['stock']<1?' (habis)':'' ?></button><?php endforeach ?></div><div class="product-title"><div><h3><?= h($product['title']) ?></h3><p><?= h($product['artist']) ?></p></div><span class="price">mulai<br><b><?= money(catalog_price($product)) ?></b></span></div><div class="product-meta"><?= h($product['genre']) ?> · <?= h($product['year']) ?> · <?= h($product['label']) ?></div><span class="product-condition"><?= $stock>0?'Stok tersedia':'Stok habis' ?> · <?= h($product['condition_name']) ?></span><div class="vibe-meter"><span>Energi: <?= h($product['energy']) ?></span><span>Mood: <?= h($product['mood']) ?></span><span>Nostalgia: <?= h($product['nostalgia']) ?></span></div><div class="product-bottom"><span class="keywords"><?= h($product['keywords']) ?></span><button class="add-cart" data-title="<?= h($product['title']) ?>" data-id="<?= (int)$product['id'] ?>" <?= $stock===0?'disabled':'' ?> aria-label="Tambah <?= h($product['title']) ?> ke keranjang">Tambah</button></div><script type="application/json" id="product-data-<?= (int)$product['id'] ?>"><?= json_encode(['title'=>$product['title'],'artist'=>$product['artist'],'condition'=>$product['condition_name'],'formats'=>$formats,'tracklist'=>$product['tracklist'],'audio'=>$product['audio_url'],'image'=>catalog_image($product),'description'=>$product['description']],JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?></script></article><?php endforeach ?></div>
<?php endif ?></main><footer class="footer"><div class="footer-bottom"><span>© <?= date('Y') ?> <?= h(setting('company_name')) ?></span><a href="index.php">Beranda</a><a href="company.php">Tentang Kami</a><a href="policies.php">Info belanja</a></div></footer><div class="mini-cart" aria-live="polite"><button class="cart-close" aria-label="Tutup">Tutup</button><span class="eyebrow">KERANJANG</span><p class="cart-message"></p><a class="button button-dark" href="cart.php">Lihat keranjang</a></div><dialog class="quick-dialog"><button class="dialog-close" aria-label="Tutup">Tutup</button><div class="dialog-content"></div></dialog><script src="assets/app.js" defer></script></body></html>
