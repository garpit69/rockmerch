import { createElement, useEffect, useMemo, useState } from 'react';
import wordmark from '../../assets/brand/rockmerch-wordmark.png';
import { money } from './store.js';

const defaultSettings = {
  company_name: 'Rock Merch',
  tagline: 'Putar keras, santai saja.',
  mission: 'Kami berburu rilisan terbaik, merawat suara analog, dan membagikannya untuk komunitas pencinta musik.',
  address: 'Bekasi, Jawa Barat',
  email: 'halo@rockmerch.id',
  opening_hours: '',
  company_story: '',
  company_selection: '',
  company_commitments: '',
  shipping_fee: '15000',
  free_shipping: '250000',
};

const navItems = [
  ['/', 'Beranda'],
  ['/?page=company', 'Tentang Kami'],
  ['/?page=policies', 'Info belanja'],
  ['/?page=order', 'Cek pesanan'],
  ['/?page=install', 'Pasang App'],
];

function usePublicSettings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public-settings', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Informasi toko belum dapat dimuat.');
        return body;
      })
      .then((body) => {
        if (!body.settings || typeof body.settings !== 'object') {
          throw new Error('Informasi toko dari server tidak valid.');
        }
        setSettings({ ...defaultSettings, ...body.settings });
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          console.error('Public store information could not be loaded.', requestError);
          setError(requestError.message);
        }
      });
    return () => controller.abort();
  }, []);

  return { settings, error };
}

function PublicShell({ children, settings, profile = false }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <>
      <header className={`site-header${profile ? ' profile-site-header' : ''}`}>
        <a className="brand" href="/" aria-label={`${settings.company_name} — beranda`}>
          <img className="brand-logo-default" src={wordmark} alt={settings.company_name} />
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Tutup menu' : 'Buka menu'}
          onClick={() => setNavOpen((open) => !open)}
        >
          Menu
        </button>
        <nav className={`main-nav${navOpen ? ' open' : ''}`} aria-label="Navigasi utama">
          {navItems.map(([href, label]) => (
            <a href={href} key={href} onClick={() => setNavOpen(false)}>{label}</a>
          ))}
        </nav>
        <div className="header-tools">
          <a className="icon-btn cart-trigger" href="/?page=cart">Keranjang</a>
          <button
            className="icon-btn theme-toggle"
            type="button"
            aria-label="Ganti mode terang atau gelap"
            onClick={() => {
              const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
              document.documentElement.dataset.theme = nextTheme;
              localStorage.setItem('rm-theme', nextTheme);
            }}
          >
            Tema
          </button>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {settings.company_name}</span>
          {navItems.slice(1).map(([href, label]) => <a href={href} key={href}>{label}</a>)}
        </div>
      </footer>
    </>
  );
}

function PageError({ message }) {
  return message ? <p className="migration-state migration-state-error" role="alert">{message}</p> : null;
}

export function CompanyPage() {
  const { settings, error } = usePublicSettings();
  const [releases, setReleases] = useState([]);
  const commitments = useMemo(() => settings.company_commitments
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean), [settings.company_commitments]);
  const whatsapp = settings.whatsapp_phone
    ? `https://wa.me/${settings.whatsapp_phone.replace(/\D/g, '')}`
    : '';
  const mapUrl = settings.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`
    : '';

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/products', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Katalog belum dapat dimuat.');
        setReleases(body.products.filter((product) => product.featured).slice(0, 3));
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          console.error('Company page releases could not be loaded.', requestError);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <PublicShell settings={settings}>
      <main className="company-page">
        <PageError message={error} />
        <section className="company-hero">
          <div className="company-hero-copy">
            <span className="eyebrow light">CERITA DI BALIK RAK</span>
            <h1>{settings.company_name}<br /><em>Records & good times.</em></h1>
            <p>{settings.tagline}</p>
            <div className="company-hero-actions">
              <a className="button button-yellow" href="/#rilisan">Jelajahi katalog <span>↗</span></a>
              <a className="button button-outline company-profile-download" href="/?page=company-profile">
                Company Profile
              </a>
            </div>
          </div>
          {releases.length > 0 && (
            <div className="company-hero-releases" aria-label="Rilisan pilihan di katalog">
              {releases.map((release, index) => release.images?.[0] && (
                <a className={`company-hero-release company-hero-release-${index + 1}`} href="/#rilisan" key={release.id}>
                  <img src={release.images[0]} alt={`${release.title} oleh ${release.artist}`} />
                  <span>{release.title}</span>
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="company-story company-section">
          <div><span className="eyebrow">ALASAN KAMI ADA</span><h2>Bukan cuma musik yang diputar.</h2></div>
          <p className="company-copy">{settings.company_story}</p>
        </section>
        <section className="company-method company-section">
          <div className="company-method-heading">
            <span className="eyebrow">PILIHAN & PERHATIAN</span>
            <h2>Rilisan yang dipilih dan dijaga keterangannya.</h2>
            <p className="company-copy">{settings.company_selection}</p>
          </div>
          <div className="company-method-note">
            <span aria-hidden="true">01 — 03</span><p>Vinyl · Kaset · CD</p>
            <small>Informasi format, harga, kondisi, dan stok tersedia di katalog.</small>
          </div>
        </section>
        {commitments.length > 0 && (
          <section className="company-values company-section">
            <span className="eyebrow">PEGANGAN KAMI</span><h2>Hal sederhana, dijaga jelas.</h2>
            <ul>{commitments.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </section>
        )}
        <section className="company-contact company-section" id="visit">
          <div>
            <span className="eyebrow">MAMPIR / SAY HELLO</span><h2>Ketemu di Bekasi.</h2>
            <p>{settings.address}</p><p><strong>{settings.opening_hours}</strong></p>
            <div className="company-contact-links">
              {mapUrl && <a className="button button-outline" href={mapUrl} target="_blank" rel="noopener noreferrer">Lihat lokasi ↗</a>}
              <a className="button button-outline" href={`mailto:${settings.email}`}>Kirim email ↗</a>
              {whatsapp && <a className="button button-outline" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}
              {settings.instagram && <a className="button button-outline" href={settings.instagram} target="_blank" rel="noopener noreferrer">Instagram ↗</a>}
              {settings.tiktok && <a className="button button-outline" href={settings.tiktok} target="_blank" rel="noopener noreferrer">TikTok ↗</a>}
              {settings.playlist && <a className="button button-outline" href={settings.playlist} target="_blank" rel="noopener noreferrer">Playlist ↗</a>}
            </div>
          </div>
          <div className="company-contact-note">
            <span className="eyebrow">BELUM YAKIN PILIHANMU?</span>
            <p>Tanya soal kondisi, format, atau ketersediaan rilisan sebelum memesan.</p>
            <a className="text-link" href="/?page=policies">Baca informasi belanja ↗</a>
          </div>
        </section>
        <section className="company-cta">
          <span className="eyebrow">GILIRANMU BERBURU</span><h2>Ada cerita baru<br />di setiap rak.</h2>
          <a className="button button-yellow" href="/#rilisan">Lihat semua rilisan <span>↗</span></a>
        </section>
      </main>
    </PublicShell>
  );
}

export function CompanyProfilePage() {
  const { settings, error } = usePublicSettings();
  const [releases, setReleases] = useState([]);
  const commitments = settings.company_commitments.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/products', { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => setReleases((body.products || []).slice(0, 3)))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') console.error('Company profile releases could not be loaded.', requestError);
      });
    return () => controller.abort();
  }, []);

  return (
    <PublicShell settings={settings} profile>
      <PageError message={error} />
      <div className="profile-toolbar">
        <a className="button button-outline" href="/?page=company">← Tentang Kami</a>
        <button className="button profile-download" type="button" onClick={() => window.print()}>
          Unduh Compfile (PDF)
        </button>
      </div>
      <p className="profile-help">Pilih “Simpan sebagai PDF” pada dialog cetak untuk mengunduh Company Profile.</p>
      <main className="profile-sheet">
        <section className="profile-cover">
          <div className="profile-brand"><img src={wordmark} alt={settings.company_name} /></div>
          <span className="eyebrow">COMPANY PROFILE · {new Date().getFullYear()}</span>
          <h1>{settings.company_name}</h1><p>{settings.tagline}</p>
        </section>
        <section className="profile-section"><h2>Cerita Kami</h2><p>{settings.company_story}</p></section>
        <section className="profile-section"><h2>Pilihan & Perhatian</h2><p>{settings.company_selection}</p></section>
        {commitments.length > 0 && (
          <section className="profile-section">
            <h2>Yang Kami Jaga</h2>
            <div className="profile-values">
              {commitments.map((item, index) => <article key={`${index}-${item}`}><h3>{String(index + 1).padStart(2, '0')}</h3><p>{item}</p></article>)}
            </div>
          </section>
        )}
        {releases.length > 0 && (
          <section className="profile-section">
            <h2>Rilisan di Rak</h2>
            <div className="profile-releases">
              {releases.map((release) => <article className="profile-release" key={release.id}><strong>{release.title}</strong><span>{release.artist}</span></article>)}
            </div>
          </section>
        )}
        <section className="profile-section">
          <h2>Informasi Toko</h2>
          <div className="profile-contact">
            <div><small>Lokasi</small><p>{settings.address}</p></div>
            <div><small>Jam Operasional</small><p>{settings.opening_hours}</p></div>
            <div><small>Email</small><p>{settings.email}</p></div>
            <div><small>Instagram</small><p>{settings.instagram}</p></div>
          </div>
        </section>
        <footer className="profile-foot">ROCK MERCH · VINYL · KASET · CD · BEKASI</footer>
      </main>
    </PublicShell>
  );
}

export function PoliciesPage() {
  const { settings, error } = usePublicSettings();
  const config = {
    shippingFee: Number(settings.shipping_fee) || 0,
    freeShippingThreshold: Number(settings.free_shipping) || 0,
  };
  const whatsapp = settings.whatsapp_phone
    ? `https://wa.me/${settings.whatsapp_phone.replace(/\D/g, '')}`
    : '';
  return (
    <PublicShell settings={settings}>
      <main className="policies-page">
        <PageError message={error} />
        <span className="eyebrow">SEBELUM KAMU CHECKOUT</span>
        <h1>Informasi belanja</h1>
        <p className="policy-intro">Ringkasan cara belanja, pembayaran, dan menghubungi toko.</p>
        <section className="policy-card">
          <h2>Pengiriman</h2>
          <p>Biaya pengiriman dasar {money(config.shippingFee)}. Gratis ongkir berlaku untuk belanja minimal {money(config.freeShippingThreshold)}.</p>
          <p>Kurir dan estimasi dikonfirmasi toko setelah pesanan diterima; nomor resi akan ditambahkan ke halaman status pesanan bila tersedia.</p>
        </section>
        <section className="policy-card">
          <h2>Pembayaran</h2>
          <p>Pembayaran dilakukan melalui transfer bank manual. Ikuti rekening dan jumlah tepat yang tampil pada konfirmasi pesanan. Jangan transfer ke rekening yang tidak tercantum di halaman pesanan.</p>
        </section>
        <section className="policy-card">
          <h2>Kondisi barang & retur</h2>
          <p>Kondisi setiap rilisan dicantumkan pada halaman produk. Hubungi toko sesegera mungkin jika barang tidak sesuai pesanan atau ada masalah kondisi, sertakan nomor pesanan dan foto yang relevan.</p>
          <p>Untuk memastikan kecocokan format dan kondisi rilisan preloved, tanyakan sebelum checkout.</p>
        </section>
        <section className="policy-card">
          <h2>Privasi</h2>
          <p>Nama, kontak, alamat, dan detail pesanan digunakan untuk memproses pembayaran, pengiriman, serta dukungan pesanan. Data pesanan tidak ditampilkan tanpa verifikasi nomor pesanan dan email checkout.</p>
        </section>
        <section className="policy-card">
          <h2>Kontak</h2>
          <p>{settings.company_name} · {settings.address}</p><p>Jam operasional: {settings.opening_hours}</p>
          <p><a href={`mailto:${settings.email}`}>{settings.email}</a></p>
          {whatsapp && <p><a className="button button-dark" href={whatsapp} target="_blank" rel="noopener noreferrer">Hubungi via WhatsApp</a></p>}
        </section>
        <a className="button button-outline" href="/#rilisan">Kembali ke katalog</a>
      </main>
    </PublicShell>
  );
}

export function InstallPage() {
  const { settings } = usePublicSettings();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event) => {
      setInstallPrompt(event.detail || event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('rm-pwa-install-available', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('rm-pwa-install-available', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  return (
    <PublicShell settings={settings}>
      <main className="install-page">
        <span className="eyebrow">ROCK MERCH DI PERANGKATMU</span>
        <h1>Pasang. Buka. Putar.</h1>
        <p>Tambahkan Rock Merch ke layar utama atau desktop untuk akses yang lebih cepat. Katalog, checkout, dan status pesanan tetap memerlukan internet.</p>
        {installPrompt && <button className="button button-yellow pwa-install-action" type="button" onClick={install}>Pasang Rock Merch</button>}
        {installed && <p role="status">Rock Merch siap dibuka dari perangkatmu.</p>}
        <section className="install-steps" aria-label="Cara memasang Rock Merch">
          <article className="install-step"><h2>Android</h2><p>Buka situs ini di Chrome, pilih menu ⋮, lalu pilih <strong>Install app</strong> atau <strong>Add to Home screen</strong>.</p></article>
          <article className="install-step"><h2>iPhone & iPad</h2><p>Buka situs ini di Safari, ketuk <strong>Bagikan</strong>, pilih <strong>Tambahkan ke Layar Utama</strong>, lalu ketuk <strong>Tambah</strong>.</p></article>
          <article className="install-step"><h2>Windows, macOS & Linux</h2><p>Gunakan Chrome atau Edge, buka menu browser atau ikon instalasi di bilah alamat, lalu pilih <strong>Install Rock Merch</strong>.</p></article>
          <article className="install-step"><h2>Browser lain</h2><p>Jika opsi pasang tidak tersedia, simpan situs ini sebagai bookmark atau pintasan browser.</p></article>
        </section>
        <p className="install-note">Instalasi memerlukan HTTPS (atau localhost untuk pengembangan). Keranjang, stok, pembayaran, dan data admin tidak tersedia tanpa koneksi internet.</p>
      </main>
    </PublicShell>
  );
}

const allowedArticleTags = new Set([
  'div', 'p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i',
  'ul', 'ol', 'li', 'a', 'blockquote', 'img',
]);

function articleUrl(value) {
  if (!value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function renderArticleNode(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  const children = [...node.childNodes].map((child, index) => renderArticleNode(child, `${key}-${index}`));
  if (!allowedArticleTags.has(tag)) return children;
  if (tag === 'img') {
    const src = articleUrl(node.getAttribute('src'));
    return src ? <img key={key} src={src} alt={node.getAttribute('alt') || ''} loading="lazy" /> : null;
  }
  if (tag === 'a') {
    const href = articleUrl(node.getAttribute('href'));
    return href ? <a href={href} key={key} target="_blank" rel="noopener noreferrer">{children}</a> : <span key={key}>{children}</span>;
  }
  return createElement(tag, { key }, ...children);
}

function ArticleContent({ content }) {
  const documentContent = useMemo(() => new DOMParser().parseFromString(content || '', 'text/html'), [content]);
  return <div className="story-body">{[...documentContent.body.childNodes].map((node, index) => renderArticleNode(node, String(index)))}</div>;
}

export function ArticlePage({ slug = '' }) {
  const { settings } = usePublicSettings();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/articles?slug=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Artikel tidak ditemukan.');
        setArticle(body.article);
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message);
          setLoading(false);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [slug]);

  return (
    <PublicShell settings={settings}>
      <main className="story-page">
        <a className="back-link" href="/#catatan">← Kembali ke Liner Notes</a>
        {loading && <p role="status">Memuat artikel…</p>}
        <PageError message={error} />
        {article && (
          <article>
            {article.image && <img className="story-cover-image" src={article.image} alt="" />}
            <p className="eyebrow">{article.category} · {new Date(article.publish_at || article.created_at).toLocaleDateString('id-ID')}</p>
            <h1>{article.title}</h1><p className="story-lede">{article.excerpt}</p>
            <ArticleContent content={article.content} />
          </article>
        )}
      </main>
    </PublicShell>
  );
}
