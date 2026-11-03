<?php
require __DIR__ . '/bootstrap.php';
$commitments=array_values(array_filter(array_map('trim',preg_split('/\r\n|\r|\n/',setting('company_commitments'))?:[])));
$releases=$db->query("SELECT title,artist FROM products WHERE status='published' ORDER BY featured DESC,created_at DESC LIMIT 3")->fetchAll();
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#171915">
  <title>Company Profile — <?= h(setting('company_name')) ?></title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="assets/brand.css">
  <link rel="stylesheet" href="assets/company-profile.css?v=<?= (int)filemtime(__DIR__ . '/assets/company-profile.css') ?>">
  <script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script>
</head>
<body class="profile-body">
  <header class="site-header">
    <a class="brand" href="company.php" aria-label="Kembali ke Tentang Kami"><?= logo_mark() ?></a>
    <a class="icon-btn" href="company.php">Kembali</a>
  </header>
  <div class="profile-toolbar">
    <a class="button button-outline" href="company.php">← Tentang Kami</a>
    <button class="button profile-download" type="button" data-print-profile>Unduh Compfile (PDF)</button>
  </div>
  <p class="profile-help">Pilih “Simpan sebagai PDF” pada dialog cetak untuk mengunduh berkas Company Profile.</p>
  <main class="profile-sheet">
    <section class="profile-cover">
      <div class="profile-brand"><?= logo_mark() ?></div>
      <span class="eyebrow">COMPANY PROFILE · <?= date('Y') ?></span>
      <h1><?= h(setting('company_name')) ?></h1>
      <p><?= h(setting('tagline')) ?></p>
    </section>
    <section class="profile-section">
      <h2>Cerita Kami</h2>
      <p><?= h(setting('company_story')) ?></p>
    </section>
    <section class="profile-section">
      <h2>Pilihan & Perhatian</h2>
      <p><?= h(setting('company_selection')) ?></p>
    </section>
    <?php if($commitments): ?>
    <section class="profile-section">
      <h2>Yang Kami Jaga</h2>
      <div class="profile-values">
        <?php foreach($commitments as $index=>$commitment): ?>
        <article><h3><?= sprintf('%02d', $index+1) ?></h3><p><?= h($commitment) ?></p></article>
        <?php endforeach ?>
      </div>
    </section>
    <?php endif ?>
    <?php if($releases): ?>
    <section class="profile-section">
      <h2>Rilisan di Rak</h2>
      <div class="profile-releases">
        <?php foreach($releases as $release): ?>
        <article class="profile-release"><strong><?= h($release['title']) ?></strong><span><?= h($release['artist']) ?></span></article>
        <?php endforeach ?>
      </div>
    </section>
    <?php endif ?>
    <section class="profile-section">
      <h2>Informasi Toko</h2>
      <div class="profile-contact">
        <div><small>Lokasi</small><p><?= h(setting('address')) ?></p></div>
        <div><small>Jam Operasional</small><p><?= h(setting('opening_hours')) ?></p></div>
        <div><small>Email</small><p><?= h(setting('email')) ?></p></div>
        <div><small>Instagram</small><p><?= h(setting('instagram')) ?></p></div>
      </div>
    </section>
    <footer class="profile-foot">ROCK MERCH · VINYL · KASET · CD · BEKASI</footer>
  </main>
  <footer class="footer"><div class="footer-bottom"><span>© <?= date('Y') ?> <?= h(setting('company_name')) ?></span><a href="index.php">Beranda</a><a href="shop.php">Katalog</a><a href="install.php">Pasang App</a></div></footer>
  <script src="assets/app.js?v=<?= (int)filemtime(__DIR__ . '/assets/app.js') ?>" defer></script>
</body>
</html>
