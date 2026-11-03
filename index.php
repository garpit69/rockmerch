<?php
require __DIR__ . '/bootstrap.php';
$company = setting('company_name');
$story = null;
if (isset($_GET['story'])) {
    $stmt = $db->prepare("SELECT * FROM articles WHERE slug=? AND status IN ('published','scheduled') AND (publish_at='' OR publish_at<=datetime('now')) AND (status!='scheduled' OR publish_at<>'')");
    $stmt->execute([$_GET['story']]);
    $story = $stmt->fetch();
}
$featured = $db->query("SELECT * FROM products WHERE status='published' AND featured=1 ORDER BY created_at DESC LIMIT 5")->fetchAll();
$merch = $db->query("SELECT * FROM products WHERE status='published' AND merchandise=1 ORDER BY created_at DESC LIMIT 2")->fetchAll();
foreach(array_merge($featured,$merch) as $product) {
    $id=(int)$product['id'];
    if((int)($_SESSION['viewed_products'][$id]??0)<time()-86400) {
        $view=$db->prepare('INSERT INTO product_views(product_id,viewed_at) VALUES(?,?)');$view->execute([$id,time()]);
        $_SESSION['viewed_products'][$id]=time();
    }
}
$articles = $db->query("SELECT * FROM articles WHERE status IN ('published','scheduled') AND (publish_at='' OR publish_at<=datetime('now')) AND (status!='scheduled' OR publish_at<>'') ORDER BY publish_at DESC,created_at DESC LIMIT 6")->fetchAll();
$cartCount = cart_item_count();
function product_image(array $product, int $index = 0): string {
    $images = json_decode($product['images'] ?: '[]', true) ?: [];
    return $images[$index] ?? $images[0] ?? 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=700&q=85';
}
function product_start_price(array $product): int {
    $formats = json_decode($product['formats'] ?: '[]', true) ?: [];
    return min(array_column($formats, 'price') ?: [0]);
}
$mission = preg_replace('/\*(.+?)\*/', '<em>$1</em>', h(setting('mission'))) ?? h(setting('mission'));
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f4efe4">
  <title><?= $story ? h($story['title']) . ' — ' : '' ?><?= h($company) ?> — Toko Rekaman Bekasi</title>
  <meta name="description" content="<?= h(setting('tagline')) ?> Toko vinyl, kaset, dan CD di Bekasi.">
  <link rel="preconnect" href="https://images.unsplash.com"><link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="assets/brand.css">
  <link rel="stylesheet" href="assets/record-room.css?v=<?= (int)filemtime(__DIR__ . '/assets/record-room.css') ?>">
  <link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#171915">
  <script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script>
</head>
<body data-csrf="<?= h(csrf_token()) ?>" data-whatsapp="<?= h(whatsapp_url()) ?>">
<div class="announcement">Gratis ongkir untuk belanja di atas <strong><?= money((int)setting('free_shipping')) ?></strong> <span>— biar piringan barumu cepat sampai.</span></div>
<header class="site-header" id="site-header">
  <a class="brand" href="index.php" aria-label="<?= h($company) ?> — beranda"><?= logo_mark() ?></a>
  <button class="menu-toggle" aria-label="Buka menu" aria-expanded="false">Menu</button>
  <nav class="main-nav" aria-label="Navigasi utama">
    <div class="nav-shop"><a href="#shop">Shop <span>⌄</span></a><div class="nav-dropdown"><a href="#shop">Vinyl</a><a href="#shop">Kaset</a><a href="#shop">CD</a><a href="#shop">Pemutar & Aksesori</a><a href="#merch">Merchandise</a></div></div>
    <a href="#club">Record Club</a><a href="company.php">Tentang Kami</a><a href="#trade">Jual/Trade-in</a><a href="#notes">Liner Notes</a><a href="#contact">Contact</a>
  </nav>
  <div class="header-tools"><button class="icon-btn" aria-label="Cari" data-search-open>Cari</button><a class="icon-btn" href="#contact" aria-label="Akun">Akun</a><a class="icon-btn cart-trigger" href="cart.php" aria-label="Keranjang">Tas<i><?= $cartCount ?></i></a><button class="icon-btn theme-toggle" aria-label="Ganti mode terang atau gelap">Tema</button></div>
</header>
<main>
<?php if ($story): ?>
  <article class="story-page">
    <a class="back-link" href="index.php#notes">← Kembali ke Liner Notes</a>
    <div class="story-cover" style="background-image:url('<?= h($story['image'] ?: product_image($featured[0] ?? ['images'=>'[]'])) ?>')"></div>
    <p class="eyebrow"><?= h($story['category']) ?> <span>·</span> <?= date('d M Y', strtotime($story['publish_at'] ?: $story['created_at'])) ?></p>
    <h1><?= h($story['title']) ?></h1><p class="story-lede"><?= h($story['excerpt']) ?></p>
    <div class="story-body"><?= $story['content'] ?></div>
  </article>
<?php else: ?>
  <section class="hero record-room-hero" id="about">
    <div class="hero-photo" role="img" aria-label="Ruang dengar dan koleksi piringan hitam"></div>
    <?php if (setting('hero_video')!==''): ?><video class="hero-video" autoplay muted loop playsinline preload="none" poster="https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=1600&q=85"><source src="<?= h(setting('hero_video')) ?>"></video><?php endif ?>
    <div class="hero-grain"></div><div class="hero-sun"></div>
    <div class="hero-copy"><span class="eyebrow light">RUANG DENGAR KECIL · BEKASI, INDONESIA</span>
      <h1>MUSIC FOR<br><em>THE MASSES</em></h1>
      <p><?= $mission ?></p>
      <div class="hero-actions"><a class="button button-yellow" href="#shop">Jelajahi rilisan <span>↘</span></a><a class="hero-secondary-link" href="company.php">Cerita di balik rak <span>↗</span></a></div>
    </div>
    <div class="hero-showcase" aria-label="Rilisan pilihan dari rak RockMerch">
      <?php if ($featured): $heroAlbum=$featured[0]; ?>
        <span class="hero-stage-index">ROCKMERCH / SIDE A</span>
        <div class="hero-record" aria-hidden="true"><div></div></div>
        <a class="hero-sleeve" href="product.php?id=<?= (int)$heroAlbum['id'] ?>" aria-label="Lihat <?= h($heroAlbum['title']) ?> oleh <?= h($heroAlbum['artist']) ?>">
          <img src="<?= h(product_image($heroAlbum)) ?>" alt="Sampul <?= h($heroAlbum['title']) ?> oleh <?= h($heroAlbum['artist']) ?>">
          <span>PILIHAN DARI RAK KAMI</span>
        </a>
        <div class="hero-player">
          <div class="hero-player-heading"><span><i></i> NOW IN THE RACK</span><span>33⅓ RPM</span></div>
          <div class="hero-player-track"><img src="<?= h(product_image($heroAlbum)) ?>" alt=""><div><strong><?= h($heroAlbum['title']) ?></strong><small><?= h($heroAlbum['artist']) ?></small></div><span class="hero-player-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
          <div class="hero-player-progress" aria-hidden="true"><span></span></div>
        </div>
      <?php else: ?>
        <span class="hero-stage-index">ROCKMERCH / EST. BEKASI</span><div class="hero-record" aria-hidden="true"><div></div></div>
      <?php endif ?>
    </div>
    <span class="hero-caption">VINYL · KASET · CD & CERITA DI DALAMNYA</span>
  </section>
  <section class="vibe-strip" aria-label="Suasana toko">
    <div class="vibe-photo vibe-photo-one"><span>Gali rak, temukan cerita.</span></div>
    <div class="vibe-tagline"><p>Putar keras,<br><em>santai saja.</em></p></div>
    <div class="vibe-photo vibe-photo-two"><span>Duduk. Dengar. Ulangi.</span></div>
  </section>
  <div class="marquee"><div>VINYL / KASET / CD / PUTAR KERAS, SANTAI SAJA / VINYL / KASET / CD / PUTAR KERAS, SANTAI SAJA /</div></div>
  <section class="section shop-section" id="shop">
    <div class="section-heading"><div><span class="eyebrow">PILIHAN DARI RAK KAMI</span><h2>Baru mendarat<span class="period">.</span></h2></div><p>Yang baru mampir ke rak, siap pindah ke rumahmu.</p></div>
    <div class="product-grid">
    <?php foreach ($featured as $product): $formats=json_decode($product['formats'] ?: '[]', true) ?: []; $images=json_decode($product['images'] ?: '[]', true) ?: []; $stock=array_sum(array_map(static fn($f)=>(int)$f['stock'],$formats)); $firstAvailable=null; foreach($formats as $formatIndex=>$formatItem) if((int)$formatItem['stock']>0){$firstAvailable=$formatIndex;break;} ?>
      <article class="product-card" data-reveal>
        <button class="product-art quick-view" data-product="<?= (int)$product['id'] ?>" aria-label="Lihat cepat <?= h($product['title']) ?>">
          <img class="cover-front" src="<?= h(product_image($product)) ?>" alt="Sampul album <?= h($product['title']) ?>" loading="lazy">
          <img class="cover-back" src="<?= h(product_image($product, 1)) ?>" alt="" loading="lazy">
          <span class="record-disc"></span>
          <?php if ($product['badge']): ?><span class="badge <?= $product['badge']==='Limited'?'badge-blue':'' ?>"><?= h($product['badge']==='New'?'New Arrival':$product['badge']) ?></span><?php endif ?>
          <span class="quick-label">Detail rilisan</span>
        </button>
        <div class="format-tabs" role="tablist" aria-label="Format <?= h($product['title']) ?>"><?php foreach ($formats as $i=>$f): ?><button class="<?= $i===$firstAvailable?'selected':'' ?>" data-price="<?= (int)$f['price'] ?>" data-format="<?= h($f['format']) ?>" <?= (int)$f['stock']<1?'disabled':'' ?> role="tab"><?= h($f['format']) ?><?= (int)$f['stock']<1?' (habis)':'' ?></button><?php endforeach ?></div>
        <div class="product-title"><div><h3><?= h($product['title']) ?></h3><p><?= h($product['artist']) ?></p></div><span class="price">mulai<br><b><?= money(product_start_price($product)) ?></b></span></div>
        <div class="product-meta"><?= h($product['genre']) ?> <span>·</span> <?= h($product['year']) ?> <span>·</span> <?= h($product['label']) ?></div>
        <span class="product-condition"><?= $stock>0?'Stok tersedia':'Stok habis' ?> · <?= h($product['condition_name']) ?></span>
        <div class="vibe-meter"><span>Energi: <?= h($product['energy']) ?></span><span>Mood: <?= h($product['mood']) ?></span><span>Nostalgia: <?= h($product['nostalgia']) ?></span></div>
        <div class="product-bottom"><span class="keywords"><?= h($product['keywords']) ?></span><button class="add-cart" data-title="<?= h($product['title']) ?>" data-id="<?= (int)$product['id'] ?>" <?= $stock===0?'disabled':'' ?>>Tambah</button></div>
        <script type="application/json" id="product-data-<?= (int)$product['id'] ?>"><?= json_encode(['title'=>$product['title'],'artist'=>$product['artist'],'condition'=>$product['condition_name'],'formats'=>$formats,'tracklist'=>$product['tracklist'],'audio'=>$product['audio_url'],'image'=>$images[0]??'','description'=>$product['description']], JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?></script>
      </article>
    <?php endforeach ?>
    </div>
    <div class="center"><a class="button button-outline" href="shop.php">Lihat Semua Rilisan</a></div>
  </section>
  <section class="club-section" id="club">
    <div class="club-photo" role="img" aria-label="Koleksi piringan dan pemutar musik"></div><div class="club-copy"><span class="eyebrow light">KIRIMAN BAIK TIAP BULAN</span><h2>Surat cinta<br>dari <em>rak kami.</em></h2><p>Rilisan pilihan, dikurasi teman yang tahu musik favoritmu. Dapat diskon khusus, kejutan kecil, dan alasan baru buat menantikan kurir.</p>
      <div class="club-plans"><div><span>01 / PEMULA</span><h3>Klasik Pilihan</h3><p>Satu rilisan pilihan untuk sesi dengar berikutnya.</p><b>mulai Rp 199k / bln</b></div><div><span>02 / PETUALANG</span><h3>Pilihan Digger</h3><p>Temuan langka buat kolektor yang suka kejutan.</p><b>mulai Rp 349k / bln</b></div></div>
      <a class="button button-yellow" href="mailto:<?= h(setting('email')) ?>?subject=Gabung%20Record%20Club">Gabung Record Club <span>↗</span></a>
    </div>
  </section>
  <section class="trade-section section" id="trade"><div><span class="eyebrow">RAK PENUH? CERITA BARU MENUNGGU.</span><h2>Koleksi menumpuk<br>di rumah?</h2><p>Kasih ruang untuk temuan baru. Koleksi lamamu bisa jadi awal cerita buat orang lain.</p><div class="trade-benefits"><span>Penilaian gratis, tanpa sungkan</span><span>Tukar jadi kredit belanja</span><span>Koleksi besar? Kami bisa jemput</span><span>Dibersihkan dan di-grading profesional</span></div><a class="button button-dark" href="mailto:<?= h(setting('email')) ?>?subject=Jual%20atau%20trade-in">Hubungi Kami</a></div></section>
  <section class="merch-section section" id="merch"><div class="section-heading"><div><span class="eyebrow">SERAGAM TAK RESMI PARA DIGGER</span><h2>Bawa pulang <em>vibenya.</em></h2></div><p>Buat yang betah ngobrol sampai toko mau tutup.</p></div><div class="merch-grid"><?php foreach ($merch as $item): ?><article class="merch-card" data-reveal><img src="<?= h(product_image($item)) ?>" alt="<?= h($item['title']) ?>" loading="lazy"><div><span class="eyebrow">DARI KOMUNITAS, UNTUK KOMUNITAS</span><h3><?= h($item['title']) ?></h3><p><?= h($item['description']) ?></p><strong><?= money(product_start_price($item)) ?></strong><button class="add-cart" data-title="<?= h($item['title']) ?>" data-id="<?= (int)$item['id'] ?>">Tambah ke tas +</button></div></article><?php endforeach ?></div></section>
  <section class="notes-section section" id="notes"><div class="section-heading"><div><span class="eyebrow">CERITA DI ANTARA TRACK</span><h2>Liner Notes<span class="period">.</span></h2></div><a class="text-link" href="#notes">Semua cerita ↗</a></div><div class="notes-grid"><?php foreach ($articles as $i=>$article): ?><a class="note-card" href="?story=<?= urlencode($article['slug']) ?>" data-reveal><div class="note-image note-image-<?= ($i%3)+1 ?>" style="<?= $article['image'] ? 'background-image:url(\''.h($article['image']).'\')' : '' ?>"><span>0<?= $i+1 ?></span></div><p class="eyebrow"><?= h($article['category']) ?> <span>·</span> <?= date('d M Y',strtotime($article['publish_at'] ?: $article['created_at'])) ?></p><h3><?= h($article['title']) ?></h3><p class="excerpt"><?= h($article['excerpt']) ?></p><span class="read-more">Lanjut baca ↗</span></a><?php endforeach ?></div></section>
  <section class="instagram-section" aria-label="Instagram"><div><span class="eyebrow">@<?= h(str_replace('https://instagram.com/','',setting('instagram'))) ?></span><h2>Teman-teman di rak.</h2></div><div class="insta-grid"><?php for($i=1;$i<=5;$i++): ?><a href="<?= h(setting('instagram')) ?>" aria-label="Lihat Instagram <?= $i ?>" class="insta insta-<?= $i ?>"></a><?php endfor ?></div></section>
<?php endif ?>
</main>
<footer class="footer" id="contact"><div class="footer-main"><div class="footer-brand"><a class="brand" href="index.php"><?= logo_mark() ?></a><p>Tempat kecil buat jatuh cinta lagi sama musik. Mampir, ngobrol, dan dengar satu album.</p><div class="socials"><a href="<?= h(setting('instagram')) ?>">Instagram ↗</a><a href="<?= h(setting('tiktok')) ?>">TikTok ↗</a></div></div><div><span class="eyebrow">MAMPIR / SAY HELLO</span><p><?= h(setting('address')) ?></p><a href="mailto:<?= h(setting('email')) ?>"><?= h(setting('email')) ?></a><p><?= h(setting('opening_hours')) ?></p></div><div><span class="eyebrow">KELILING RAK</span><a href="#shop">Semua rilisan</a><a href="company.php">Tentang Kami</a><a href="policies.php">Info belanja</a><a href="#club">Record Club</a><a href="#trade">Jual / Trade-in</a><a href="#notes">Liner Notes</a></div><div><span class="eyebrow">DENGARIN DULU</span><a class="playlist-box" href="<?= h(setting('playlist')) ?>">♫ &nbsp;Playlist teman rak <span>↗</span></a><p class="playlist-note">Pilihan lagu yang sering muter di toko.</p></div></div><div class="footer-bottom"><span>© <?= date('Y') ?> <?= h($company) ?>. Dibuat sambil mendengarkan.</span><span>Bekasi, Indonesia <span class="sun-dot">✳</span></span></div></footer>
<div class="search-overlay" hidden><button class="close-search" aria-label="Tutup">Tutup</button><label for="site-search">Cari yang lagi kamu bayangin...</label><input id="site-search" type="search" placeholder="Judul, artis, genre..."><div class="search-results"></div></div>
<aside class="mini-cart" aria-live="polite"><button class="cart-close" aria-label="Tutup keranjang">Tutup</button><span class="eyebrow">KERANJANG DIPERBARUI</span><p class="cart-message">Rilisan siap menemani sesi dengarmu.</p><a class="button button-dark" href="cart.php">Lihat keranjang</a></aside>
<dialog class="quick-dialog"><button class="dialog-close" aria-label="Tutup">Tutup</button><div class="dialog-content"></div></dialog>
<script src="assets/app.js?v=<?= (int)filemtime(__DIR__ . '/assets/app.js') ?>" defer></script>
</body></html>
