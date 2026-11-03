<?php
require __DIR__ . '/bootstrap.php';
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#171915">
  <title>Pasang Rock Merch — <?= h(setting('company_name')) ?></title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="assets/brand.css">
  <link rel="stylesheet" href="assets/pwa.css">
  <script>const savedTheme=localStorage.getItem('rm-theme');document.documentElement.dataset.theme=savedTheme==='dark'||savedTheme==='light'?savedTheme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');</script>
</head>
<body>
  <header class="site-header" id="site-header">
    <a class="brand" href="index.php" aria-label="<?= h(setting('company_name')) ?> — beranda"><?= logo_mark() ?></a>
    <button class="menu-toggle" aria-label="Buka menu" aria-expanded="false">Menu</button>
    <nav class="main-nav" aria-label="Navigasi utama">
      <a href="index.php">Beranda</a>
      <a href="shop.php">Katalog</a>
      <a href="company.php">Tentang Kami</a>
      <a href="install.php" aria-current="page">Pasang App</a>
    </nav>
    <div class="header-tools">
      <button class="icon-btn theme-toggle" aria-label="Ganti tema">Tema</button>
      <a class="icon-btn cart-trigger" href="cart.php">Keranjang <i><?= cart_item_count() ?></i></a>
    </div>
  </header>
  <main class="install-page">
    <span class="eyebrow">ROCK MERCH DI PERANGKATMU</span>
    <h1>Pasang. Buka. Putar.</h1>
    <p>Tambahkan Rock Merch ke layar utama atau desktop untuk akses yang lebih cepat. Aplikasi ini tetap memerlukan internet untuk katalog terbaru, checkout, dan akun.</p>
    <button class="button button-yellow pwa-install-action" type="button" data-install-app hidden>Pasang Rock Merch</button>
    <section class="install-steps" aria-label="Cara memasang Rock Merch">
      <article class="install-step">
        <h2>Android</h2>
        <p>Buka situs ini di Chrome, pilih menu ⋮, lalu pilih <strong>Install app</strong> atau <strong>Add to Home screen</strong>.</p>
      </article>
      <article class="install-step">
        <h2>iPhone & iPad</h2>
        <p>Buka situs ini di Safari, ketuk <strong>Bagikan</strong>, pilih <strong>Tambahkan ke Layar Utama</strong>, lalu ketuk <strong>Tambah</strong>.</p>
      </article>
      <article class="install-step">
        <h2>Windows, macOS & Linux</h2>
        <p>Gunakan Chrome atau Edge, buka menu browser atau ikon instalasi di bilah alamat, lalu pilih <strong>Install Rock Merch</strong>.</p>
      </article>
      <article class="install-step">
        <h2>Browser lain</h2>
        <p>Dukungan instalasi berbeda-beda. Jika opsi pasang tidak tersedia, simpan situs ini sebagai bookmark atau pintasan browser.</p>
      </article>
    </section>
    <p class="install-note">Instalasi tersedia saat situs dibuka melalui HTTPS (atau localhost untuk pengembangan). Keranjang, stok, pembayaran, dan data admin tidak tersedia tanpa koneksi internet.</p>
  </main>
  <footer class="footer"><div class="footer-bottom"><span>© <?= date('Y') ?> <?= h(setting('company_name')) ?></span><a href="index.php">Beranda</a><a href="shop.php">Katalog</a><a href="company.php">Tentang Kami</a></div></footer>
  <script src="assets/app.js?v=<?= (int)filemtime(__DIR__ . '/assets/app.js') ?>" defer></script>
</body>
</html>
