import { useEffect, useState } from 'react';
import wordmark from '../../assets/brand/rockmerch-wordmark.png';

const money = (amount) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

function ProductCard({ product }) {
  const image = Array.isArray(product.images) ? product.images[0] : '';
  const formats = Array.isArray(product.formats) ? product.formats : [];
  const prices = formats
    .map((format) => Number(format.price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  return (
    <article className="product-card">
      <div className="product-art">
        {image ? (
          <img
            className="cover-front"
            src={image}
            alt={`Sampul ${product.title} oleh ${product.artist}`}
            loading="lazy"
          />
        ) : (
          <div className="migration-cover-placeholder" aria-hidden="true">
            ROCKMERCH
          </div>
        )}
        {product.badge && <span className="badge">{product.badge}</span>}
      </div>
      <div className="product-title">
        <div>
          <h3>{product.title}</h3>
          <p>{product.artist}</p>
        </div>
        {prices.length > 0 && (
          <span className="price">
            mulai
            <br />
            <b>{money(Math.min(...prices))}</b>
          </span>
        )}
      </div>
    </article>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [catalogState, setCatalogState] = useState('loading');
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('rm-theme');
    return saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#262723' : '#f4efe4',
    );
  }, [theme]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = (event) => {
      if (!localStorage.getItem('rm-theme')) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };
    preference.addEventListener('change', updateTheme);
    return () => preference.removeEventListener('change', updateTheme);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/products', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Catalog request failed (${response.status}).`);
        }
        return response.json();
      })
      .then(({ products: loadedProducts }) => {
        if (!Array.isArray(loadedProducts)) {
          throw new Error('Catalog response has an invalid shape.');
        }
        setProducts(loadedProducts);
        setCatalogState('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('RockMerch catalog could not be loaded.', error);
          setCatalogState('unavailable');
        }
      });

    return () => controller.abort();
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('rm-theme', nextTheme);
    setTheme(nextTheme);
  };

  const featured = products.filter((product) => product.featured);

  return (
    <>
      <div className="migration-notice">
        Pratinjau migrasi · Versi PHP lama tetap tersedia di branch main
      </div>
      <div className="announcement">
        Rilisan fisik, cerita nyata <strong>·</strong>{' '}
        <span>Putar keras, santai saja.</span>
      </div>
      <header className="site-header" id="site-header">
        <a className="brand" href="#" aria-label="RockMerch — beranda">
          <img className="brand-logo-default" src={wordmark} alt="RockMerch" />
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-label={navOpen ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((open) => !open)}
        >
          Menu
        </button>
        <nav className={`main-nav${navOpen ? ' open' : ''}`} aria-label="Navigasi utama">
          <a href="#rilisan" onClick={() => setNavOpen(false)}>Rilisan</a>
          <a href="#tentang" onClick={() => setNavOpen(false)}>Tentang Kami</a>
          <a href="#catatan" onClick={() => setNavOpen(false)}>Liner Notes</a>
        </nav>
        <div className="header-tools">
          <button
            className="icon-btn theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Ganti mode terang atau gelap"
          >
            Tema
          </button>
        </div>
      </header>

      <main>
        <section className="hero record-room-hero" id="tentang">
          <div
            className="hero-photo"
            role="img"
            aria-label="Ruang dengar dan koleksi piringan hitam"
          />
          <div className="hero-grain" />
          <div className="hero-sun" />
          <div className="hero-copy">
            <span className="eyebrow light">
              RUANG DENGAR KECIL · BEKASI, INDONESIA
            </span>
            <h1>
              MUSIC FOR
              <br />
              <em>THE MASSES</em>
            </h1>
            <p>
              Kami berburu rilisan terbaik, merawat suara analog, dan
              membagikannya untuk komunitas pencinta musik.
            </p>
            <div className="hero-actions">
              <a className="button button-yellow" href="#rilisan">
                Jelajahi rilisan <span>↘</span>
              </a>
              <a className="hero-secondary-link" href="#tentang">
                Cerita di balik rak <span>↗</span>
              </a>
            </div>
          </div>
          <div className="hero-showcase" aria-label="Rilisan pilihan RockMerch">
            <span className="hero-stage-index">ROCKMERCH / SIDE A</span>
            <div className="hero-record" aria-hidden="true">
              <div />
            </div>
            {featured[0] && (
              <>
                {Array.isArray(featured[0].images) && featured[0].images[0] && (
                  <a className="hero-sleeve" href="#rilisan">
                    <img
                      src={featured[0].images[0]}
                      alt={`Sampul ${featured[0].title} oleh ${featured[0].artist}`}
                    />
                    <span>PILIHAN DARI RAK KAMI</span>
                  </a>
                )}
                <div className="hero-player">
                  <div className="hero-player-heading">
                    <span><i /> NOW IN THE RACK</span>
                    <span>33⅓ RPM</span>
                  </div>
                  <div className="hero-player-track">
                    {featured[0].images?.[0] && (
                      <img src={featured[0].images[0]} alt="" />
                    )}
                    <div>
                      <strong>{featured[0].title}</strong>
                      <small>{featured[0].artist}</small>
                    </div>
                    <span className="hero-player-equalizer" aria-hidden="true">
                      <i /><i /><i /><i />
                    </span>
                  </div>
                  <div className="hero-player-progress" aria-hidden="true">
                    <span />
                  </div>
                </div>
              </>
            )}
          </div>
          <span className="hero-caption">
            VINYL · KASET · CD & CERITA DI DALAMNYA
          </span>
        </section>

        <section className="section shop-section migration-catalog" id="rilisan">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PILIHAN DARI RAK KAMI</span>
              <h2>Baru mendarat<span className="period">.</span></h2>
            </div>
            <p>Yang baru mampir ke rak, siap pindah ke rumahmu.</p>
          </div>
          {catalogState === 'loading' && (
            <p className="migration-state" role="status">Memuat katalog…</p>
          )}
          {catalogState === 'unavailable' && (
            <p className="migration-state migration-state-error" role="alert">
              Katalog belum dapat dimuat. Pastikan skema Neon staging sudah
              diterapkan dan DATABASE_URL tersedia di environment Functions.
            </p>
          )}
          {catalogState === 'ready' && featured.length === 0 && (
            <p className="migration-state">
              Database staging tersambung, tetapi belum ada rilisan yang
              dipublikasikan.
            </p>
          )}
          {featured.length > 0 && (
            <div className="product-grid">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer migration-footer" id="catatan">
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} RockMerch</span>
          <span>Vinyl · Kaset · CD</span>
        </div>
      </footer>
    </>
  );
}
