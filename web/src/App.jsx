import { useEffect, useMemo, useRef, useState } from 'react';
import wordmark from '../../assets/brand/rockmerch-wordmark.png';
import { formatName, money } from './store.js';

function ProductCard({ product, onSelect, onAdd }) {
  const [selectedFormat, setSelectedFormat] = useState('');
  const [notice, setNotice] = useState('');
  const images = Array.isArray(product.images) ? product.images : [];
  const formats = Array.isArray(product.formats) ? product.formats : [];
  const availableFormat = formats.find((format) => Number(format.stock) > 0);
  const activeFormat = formats.find((format) => formatName(format) === selectedFormat)
    || availableFormat
    || formats[0];
  const prices = formats
    .map((format) => Number(format.price))
    .filter((price) => Number.isFinite(price) && price >= 0);
  const stock = formats.reduce(
    (total, format) => total + Math.max(0, Number(format.stock) || 0),
    0,
  );

  return (
    <article className="product-card migration-product-card">
      <button
        className="product-art migration-product-art"
        type="button"
        onClick={() => onSelect(product)}
        aria-label={`Lihat detail ${product.title} oleh ${product.artist}`}
      >
        {images[0] ? (
          <img
            className="cover-front"
            src={images[0]}
            alt={`Sampul ${product.title} oleh ${product.artist}`}
            loading="lazy"
          />
        ) : (
          <div className="migration-cover-placeholder" aria-hidden="true">
            ROCKMERCH
          </div>
        )}
        {images[1] && <img className="cover-back" src={images[1]} alt="" loading="lazy" />}
        <span className="record-disc" aria-hidden="true" />
        {product.badge && (
          <span className={`badge${product.badge === 'Limited' ? ' badge-blue' : ''}`}>
            {product.badge === 'New' ? 'New Arrival' : product.badge}
          </span>
        )}
        {stock === 0 && <span className="badge badge-sold">Habis</span>}
        <span className="quick-label">Detail rilisan</span>
      </button>
      <div className="format-tabs" role="tablist" aria-label={`Format ${product.title}`}>
        {formats.map((format, index) => {
          const name = formatName(format);
          const isSelected = formatName(activeFormat) === name;
          const formatStock = Math.max(0, Number(format.stock) || 0);
          return (
            <button
              key={`${name}-${index}`}
              className={isSelected ? 'selected' : ''}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={formatStock < 1}
              onClick={() => { setSelectedFormat(name); setNotice(''); }}
            >
              {name}{formatStock > 0 ? ` · ${formatStock}` : ' · habis'}
            </button>
          );
        })}
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
            <b>{money(Number(activeFormat?.price) || Math.min(...prices))}</b>
          </span>
        )}
      </div>
      <div className="product-meta">{[product.genre, product.year, product.label].filter(Boolean).join(' · ')}</div>
      <span className="product-condition">
        {stock > 0 ? 'Stok tersedia' : 'Stok habis'} · {product.condition_name || 'Kondisi belum dicantumkan'}
      </span>
      <div className="vibe-meter">
        {product.energy && <span>Energi: {product.energy}</span>}
        {product.mood && <span>Mood: {product.mood}</span>}
        {product.nostalgia && <span>Nostalgia: {product.nostalgia}</span>}
      </div>
      <div className="product-bottom">
        <span className="keywords">{product.keywords || ''}</span>
        <button
          className="add-cart"
          type="button"
          disabled={!activeFormat || Number(activeFormat.stock) < 1}
          onClick={() => setNotice(onAdd(product, formatName(activeFormat)))}
        >
          Tambah
        </button>
      </div>
      {notice && <small className="migration-card-notice" role="status">{notice}</small>}
    </article>
  );
}

export default function App({
  cart,
  cartError,
  onAddToCart,
  catalogOnly = false,
  initialSearch = '',
  initialFormat = '',
}) {
  const [products, setProducts] = useState([]);
  const [articles, setArticles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewsError, setReviewsError] = useState('');
  const [catalogState, setCatalogState] = useState('loading');
  const [search, setSearch] = useState(initialSearch);
  const [formatFilter, setFormatFilter] = useState(initialFormat);
  const [genreFilter, setGenreFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartNotice, setCartNotice] = useState('');
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overlaySearch, setOverlaySearch] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const detailDialog = useRef(null);
  const searchInput = useRef(null);
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
    setSearch(initialSearch);
    setFormatFilter(initialFormat);
  }, [initialSearch, initialFormat]);

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
    const dialog = detailDialog.current;
    if (!dialog) return;
    if (selectedProduct && !dialog.open) {
      dialog.showModal();
    } else if (!selectedProduct && dialog.open) {
      dialog.close();
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedProduct(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedProduct]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    searchInput.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [searchOpen]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async (path) => {
      const response = await fetch(path, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `${path} request failed (${response.status}).`);
      return body;
    };
    load('/api/products')
      .then(({ products: loadedProducts }) => {
        if (!Array.isArray(loadedProducts)) throw new Error('Catalog response has an invalid shape.');
        setProducts(loadedProducts);
        setCatalogState('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('RockMerch catalog could not be loaded.', error);
          setCatalogState('unavailable');
        }
      });
    load('/api/articles')
      .then(({ articles: loadedArticles }) => {
        if (!Array.isArray(loadedArticles)) throw new Error('Article response has an invalid shape.');
        setArticles(loadedArticles);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('RockMerch articles could not be loaded.', error);
      });
    load('/api/public-settings')
      .then(({ settings: loadedSettings }) => setSettings(loadedSettings))
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('RockMerch store settings could not be loaded.', error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) return undefined;
    const timer = window.setTimeout(() => {
      fetch('/api/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'search', term: search.trim() }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Search event could not be recorded (${response.status}).`);
      }).catch((error) => console.error('Search analytics could not be recorded.', error));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedProduct) {
      setReviews([]);
      setReviewsError('');
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/api/reviews?product_id=${encodeURIComponent(selectedProduct.id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Ulasan belum dapat dimuat.');
        if (!Array.isArray(body.reviews)) throw new Error('Review response has an invalid shape.');
        return body.reviews;
      })
      .then(setReviews)
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Product reviews could not be loaded.', error);
          setReviewsError(error.message);
        }
      });
    return () => controller.abort();
  }, [selectedProduct]);

  const selectProduct = (product) => {
    setSelectedProduct(product);
    const key = `rm-viewed-${product.id}`;
    const lastViewed = Number(localStorage.getItem(key) || 0);
    if (Date.now() - lastViewed > 86_400_000) {
      localStorage.setItem(key, String(Date.now()));
      fetch('/api/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'view', product_id: product.id }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Product view could not be recorded (${response.status}).`);
      }).catch((error) => console.error('Product view analytics could not be recorded.', error));
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('rm-theme', nextTheme);
    setTheme(nextTheme);
  };

  const featured = products.filter((product) => product.featured);
  const homeFeatured = featured.slice(0, 5);
  const merchandise = products.filter((product) => product.merchandise).slice(0, 2);
  const relatedProducts = selectedProduct
    ? products
      .filter((product) => (
        String(product.id) !== String(selectedProduct.id)
        && !product.merchandise
        && ((product.genre && product.genre === selectedProduct.genre)
          || (product.artist && product.artist === selectedProduct.artist))
      ))
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
      .slice(0, 4)
    : [];
  const genres = useMemo(
    () => [...new Set(products.map((product) => product.genre).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'id')),
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('id');
    const filtered = products.filter((product) => {
      const formats = Array.isArray(product.formats) ? product.formats : [];
      const matchesFormat = !formatFilter || formats.some(
        (format) => (format.format || format.name) === formatFilter,
      );
      const matchesGenre = !genreFilter || product.genre === genreFilter;
      const searchableText = [product.title, product.artist, product.genre]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('id');
      return matchesFormat && matchesGenre && searchableText.includes(normalizedSearch);
    });

    if (sortOrder === 'title') {
      return filtered.sort((a, b) => a.title.localeCompare(b.title, 'id'));
    }
    if (sortOrder === 'price_asc' || sortOrder === 'price_desc') {
      return filtered.sort((a, b) => {
        const getPrice = (product) => {
          const prices = (Array.isArray(product.formats) ? product.formats : [])
            .map((format) => Number(format.price))
            .filter((price) => Number.isFinite(price) && price >= 0);
          return prices.length ? Math.min(...prices) : 0;
        };
        const difference = getPrice(a) - getPrice(b);
        return sortOrder === 'price_asc' ? difference : -difference;
      });
    }
    return filtered;
  }, [products, search, formatFilter, genreFilter, sortOrder]);

  const resetFilters = () => {
    setSearch('');
    setFormatFilter('');
    setGenreFilter('');
    setSortOrder('newest');
  };
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const overlayProducts = products
    .filter((product) => {
      const term = overlaySearch.trim().toLocaleLowerCase('id');
      return term.length >= 2 && [product.title, product.artist, product.genre]
        .join(' ')
        .toLocaleLowerCase('id')
        .includes(term);
    })
    .slice(0, 8);
  const searchCatalogHref = `/?page=catalog${overlaySearch.trim()
    ? `&q=${encodeURIComponent(overlaySearch.trim())}`
    : ''}`;
  const instagramHandle = (settings?.instagram || '')
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\/?/i, '')
    .replace(/\/$/, '');
  const addFromCard = (product, format) => {
    const result = onAddToCart(product, format);
    setCartNotice(result.message);
    setMiniCartOpen(result.ok);
    return result.message;
  };

  return (
    <>
      {cartError && (
        <p className="migration-state migration-state-error" role="alert">
          {cartError} <a href="/?page=cart">Periksa keranjang</a>
        </p>
      )}
      <div className="announcement">
        Gratis ongkir untuk belanja di atas{' '}
        <strong>{money(Number(settings?.free_shipping) || 250000)}</strong>
        <span>— biar piringan barumu cepat sampai.</span>
      </div>
      <header className="site-header" id="site-header">
        <a className="brand" href="/" aria-label="RockMerch — beranda">
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
          <div className="nav-shop">
            <a href="/?page=catalog" onClick={() => setNavOpen(false)}>Shop <span>⌄</span></a>
            <div className="nav-dropdown">
              <a href="/?page=catalog&format=Vinyl">Vinyl</a>
              <a href="/?page=catalog&format=Kaset">Kaset</a>
              <a href="/?page=catalog&format=CD">CD</a>
              <a href="/?page=catalog&format=Merchandise">Pemutar & aksesori</a>
              <a href="/#merch" onClick={() => setNavOpen(false)}>Merchandise</a>
            </div>
          </div>
          <a href="/#club" onClick={() => setNavOpen(false)}>Record Club</a>
          <a href="/?page=company" onClick={() => setNavOpen(false)}>Tentang Kami</a>
          <a href="/#trade" onClick={() => setNavOpen(false)}>Jual/Trade-in</a>
          <a href="/#notes" onClick={() => setNavOpen(false)}>Liner Notes</a>
          <a href="/#contact" onClick={() => setNavOpen(false)}>Contact</a>
        </nav>
        <div className="header-tools">
          <button
            className="icon-btn"
            type="button"
            aria-label="Cari rilisan"
            onClick={() => setSearchOpen(true)}
          >
            Cari
          </button>
          <a className="icon-btn" href="/#contact" aria-label="Akun">Akun</a>
          <a className="icon-btn cart-trigger" href="/?page=cart" aria-label={`Keranjang, ${cartCount} item`}>
            Tas<i>{cartCount}</i>
          </a>
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
        {!catalogOnly && <section className="hero record-room-hero" id="about">
          <div
            className="hero-photo"
            role="img"
            aria-label="Ruang dengar dan koleksi piringan hitam"
          />
          {settings?.hero_video && (
            <video
              className="hero-video"
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              poster="https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=1600&q=85"
            >
              <source src={settings.hero_video} />
            </video>
          )}
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
            <p>{settings?.mission || 'Kami berburu rilisan terbaik, merawat suara analog, dan membagikannya untuk komunitas pencinta musik.'}</p>
            <div className="hero-actions">
              <a className="button button-yellow" href="/#rilisan">
                Jelajahi rilisan <span>↘</span>
              </a>
              <a className="hero-secondary-link" href="/?page=company">
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
        </section>}

        {catalogOnly ? (
          <section className="section shop-section migration-catalog" id="rilisan">
            <div className="catalog-intro">
              <span className="eyebrow">VINYL · KASET · CD</span>
              <h1>Temukan giliran<br />untuk diputar.</h1>
              <p>Jelajahi semua rilisan di rak. Cari album, artis, atau genre yang sedang kamu cari.</p>
            </div>
            {catalogState === 'loading' && <p className="migration-state" role="status">Memuat katalog…</p>}
            {catalogState === 'unavailable' && (
              <p className="migration-state migration-state-error" role="alert">
                Katalog belum dapat dimuat. Pastikan database staging tersedia.
              </p>
            )}
            {catalogState === 'ready' && (
              <>
                <div className="migration-catalog-controls">
                  <label>
                    Cari rilisan
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama album, artis, atau genre" />
                  </label>
                  <label>
                    Format
                    <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}>
                      <option value="">Semua format</option>
                      {['Vinyl', 'Kaset', 'CD', 'Merchandise'].map((format) => <option key={format}>{format}</option>)}
                    </select>
                  </label>
                  <label>
                    Genre
                    <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                      <option value="">Semua genre</option>
                      {genres.map((genre) => <option key={genre}>{genre}</option>)}
                    </select>
                  </label>
                  <label>
                    Urutkan
                    <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                      <option value="newest">Terbaru</option>
                      <option value="price_asc">Harga terendah</option>
                      <option value="price_desc">Harga tertinggi</option>
                      <option value="title">Nama album</option>
                    </select>
                  </label>
                  <button className="button button-outline migration-reset" type="button" onClick={resetFilters}>Reset filter</button>
                </div>
                <div className="migration-catalog-result" aria-live="polite">
                  <span>{visibleProducts.length} rilisan ditemukan</span>
                  {search.trim() && <span>Pencarian: “{search.trim()}”</span>}
                </div>
                {!products.length ? (
                  <p className="migration-state">Belum ada rilisan yang dipublikasikan.</p>
                ) : !visibleProducts.length ? (
                  <div className="migration-state">
                    <p>Belum ada rilisan yang cocok dengan pencarian atau filter.</p>
                    <button className="button button-outline" type="button" onClick={resetFilters}>Reset filter</button>
                  </div>
                ) : (
                  <div className="product-grid migration-product-grid">
                    {visibleProducts.map((product) => (
                      <ProductCard key={product.id} product={product} onSelect={selectProduct} onAdd={addFromCard} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            <section className="vibe-strip" aria-label="Suasana toko">
              <div className="vibe-photo vibe-photo-one"><span>Gali rak, temukan cerita.</span></div>
              <div className="vibe-tagline"><p>Putar keras,<br /><em>santai saja.</em></p></div>
              <div className="vibe-photo vibe-photo-two"><span>Duduk. Dengar. Ulangi.</span></div>
            </section>
            <div className="marquee" aria-hidden="true">
              <div>VINYL / KASET / CD / PUTAR KERAS, SANTAI SAJA / VINYL / KASET / CD / PUTAR KERAS, SANTAI SAJA /</div>
            </div>
            <section className="section shop-section" id="rilisan">
              <div className="section-heading">
                <div><span className="eyebrow">PILIHAN DARI RAK KAMI</span><h2>Baru mendarat<span className="period">.</span></h2></div>
                <p>Yang baru mampir ke rak, siap pindah ke rumahmu.</p>
              </div>
              {catalogState === 'loading' && <p className="migration-state" role="status">Memuat katalog…</p>}
              {catalogState === 'unavailable' && <p className="migration-state migration-state-error" role="alert">Katalog belum dapat dimuat. Coba lagi sebentar.</p>}
              {catalogState === 'ready' && (
                homeFeatured.length ? (
                  <div className="product-grid">
                    {homeFeatured.map((product) => (
                      <ProductCard key={product.id} product={product} onSelect={selectProduct} onAdd={addFromCard} />
                    ))}
                  </div>
                ) : <p className="migration-state">Belum ada rilisan unggulan. Temukan semua rilisan di katalog.</p>
              )}
              <div className="center"><a className="button button-outline" href="/?page=catalog">Lihat Semua Rilisan</a></div>
            </section>
            <section className="club-section" id="club">
              <div className="club-photo" role="img" aria-label="Koleksi piringan dan pemutar musik" />
              <div className="club-copy">
                <span className="eyebrow light">KIRIMAN BAIK TIAP BULAN</span>
                <h2>Surat cinta<br />dari <em>rak kami.</em></h2>
                <p>Rilisan pilihan, dikurasi teman yang tahu musik favoritmu. Dapat diskon khusus, kejutan kecil, dan alasan baru buat menantikan kurir.</p>
                <div className="club-plans">
                  <div><span>01 / PEMULA</span><h3>Klasik Pilihan</h3><p>Satu rilisan pilihan untuk sesi dengar berikutnya.</p><b>mulai Rp 199k / bln</b></div>
                  <div><span>02 / PETUALANG</span><h3>Pilihan Digger</h3><p>Temuan langka buat kolektor yang suka kejutan.</p><b>mulai Rp 349k / bln</b></div>
                </div>
                <a className="button button-yellow" href={`mailto:${settings?.email || ''}?subject=Gabung%20Record%20Club`}>Gabung Record Club <span>↗</span></a>
              </div>
            </section>
            <section className="trade-section section" id="trade">
              <div>
                <span className="eyebrow">RAK PENUH? CERITA BARU MENUNGGU.</span>
                <h2>Koleksi menumpuk<br />di rumah?</h2>
                <p>Kasih ruang untuk temuan baru. Koleksi lamamu bisa jadi awal cerita buat orang lain.</p>
                <div className="trade-benefits">
                  <span>Penilaian gratis, tanpa sungkan</span><span>Tukar jadi kredit belanja</span>
                  <span>Koleksi besar? Kami bisa jemput</span><span>Dibersihkan dan di-grading profesional</span>
                </div>
                <a className="button button-dark" href={`mailto:${settings?.email || ''}?subject=Jual%20atau%20trade-in`}>Hubungi Kami</a>
              </div>
            </section>
            <section className="merch-section section" id="merch">
              <div className="section-heading">
                <div><span className="eyebrow">SERAGAM TAK RESMI PARA DIGGER</span><h2>Bawa pulang <em>vibenya.</em></h2></div>
                <p>Buat yang betah ngobrol sampai toko mau tutup.</p>
              </div>
              <div className="merch-grid">
                {merchandise.map((item) => {
                  const format = item.formats?.find((entry) => Number(entry.stock) > 0);
                  return (
                    <article className="merch-card" key={item.id}>
                      {item.images?.[0] && <img src={item.images[0]} alt={item.title} loading="lazy" />}
                      <div>
                        <span className="eyebrow">DARI KOMUNITAS, UNTUK KOMUNITAS</span>
                        <h3>{item.title}</h3><p>{item.description}</p>
                        {format && <strong>{money(Number(format.price) || 0)}</strong>}
                        <button className="add-cart" type="button" disabled={!format} onClick={() => format && addFromCard(item, formatName(format))}>
                          Tambah ke tas +
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!merchandise.length && <p className="migration-state">Merchandise belum tersedia.</p>}
              </div>
            </section>
            <section className="notes-section section" id="notes">
              <div className="section-heading">
                <div><span className="eyebrow">CERITA DI ANTARA TRACK</span><h2>Liner Notes<span className="period">.</span></h2></div>
                <a className="text-link" href="#notes">Semua cerita ↗</a>
              </div>
              <div className="notes-grid">
                {articles.slice(0, 6).map((article, index) => (
                  <a className="note-card" href={`/?page=article&slug=${encodeURIComponent(article.slug)}`} key={article.id}>
                    <div className={`note-image note-image-${(index % 3) + 1}`} style={article.image ? { backgroundImage: `url("${article.image}")` } : undefined}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                    </div>
                    <p className="eyebrow">{article.category || 'LINER NOTES'} <span>·</span> {new Date(article.publish_at || article.created_at).toLocaleDateString('id-ID')}</p>
                    <h3>{article.title}</h3><p className="excerpt">{article.excerpt}</p><span className="read-more">Lanjut baca ↗</span>
                  </a>
                ))}
                {!articles.length && <p className="migration-state">Belum ada cerita baru di rak.</p>}
              </div>
            </section>
            <section className="instagram-section" aria-label="Instagram">
              <div><span className="eyebrow">@{instagramHandle || 'ROCKMERCH'}</span><h2>Teman-teman di rak.</h2></div>
              <div className="insta-grid">
                {[1, 2, 3, 4, 5].map((number) => (
                  <a href={settings?.instagram || '#contact'} aria-label={`Lihat Instagram ${number}`} className={`insta insta-${number}`} key={number} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <dialog
        className="migration-product-dialog"
        ref={detailDialog}
        aria-labelledby="migration-product-title"
        onClose={() => setSelectedProduct(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedProduct(null);
        }}
      >
        {selectedProduct && (
          <div className="migration-product-detail">
            <button
              className="migration-dialog-close"
              type="button"
              onClick={() => setSelectedProduct(null)}
              aria-label="Tutup detail rilisan"
            >
              ×
            </button>
            <div className="migration-detail-image">
              {selectedProduct.images?.[0] ? (
                <img
                  src={selectedProduct.images[0]}
                  alt={`Sampul ${selectedProduct.title} oleh ${selectedProduct.artist}`}
                />
              ) : (
                <div className="migration-cover-placeholder" aria-hidden="true">ROCKMERCH</div>
              )}
            </div>
            <div className="migration-detail-copy">
              <span className="eyebrow">
                {[selectedProduct.genre, selectedProduct.year].filter(Boolean).join(' · ') || 'RILISAN ROCKMERCH'}
              </span>
              <h2 id="migration-product-title">{selectedProduct.title}</h2>
              <p className="migration-detail-artist">{selectedProduct.artist}</p>
              <p className="migration-product-meta">
                {[selectedProduct.label, selectedProduct.condition_name && `Kondisi: ${selectedProduct.condition_name}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="migration-condition-note">
                Total stok semua format: {(selectedProduct.formats || [])
                  .reduce((total, format) => total + Math.max(0, Number(format.stock) || 0), 0)} unit ·{' '}
                {({
                  Baru: 'Belum pernah dipakai.',
                  Mint: 'Kondisi nyaris sempurna; tidak terlihat cacat berarti.',
                  'VG+': 'Sangat baik; mungkin ada tanda pemakaian ringan yang tidak mengganggu pemutaran.',
                  VG: 'Baik; tanda pemakaian terlihat dan dapat ada noise ringan.',
                  Good: 'Pernah dipakai cukup lama; tanda pemakaian jelas, namun rilisan tetap dapat dinikmati.',
                })[selectedProduct.condition_name] || 'Kondisi rilisan dicantumkan sesuai pemeriksaan toko.'}
              </p>
              {selectedProduct.description && (
                <p className="migration-detail-description">{selectedProduct.description}</p>
              )}
              <h3>Format dan ketersediaan</h3>
              {Array.isArray(selectedProduct.formats) && selectedProduct.formats.length > 0 ? (
                <ul className="migration-format-list">
                  {selectedProduct.formats.map((format, index) => {
                    const stock = Math.max(0, Number(format.stock) || 0);
                    const hasStockData = format.stock !== undefined
                      && format.stock !== null
                      && format.stock !== '';
                    return (
                      <li key={`${formatName(format) || 'format'}-${index}`}>
                        <span>{formatName(format) || 'Format'}</span>
                        <strong>{money(Number(format.price) || 0)}</strong>
                        <small>
                          {hasStockData
                            ? (stock > 0 ? `Stok: ${stock} unit` : 'Stok habis')
                            : 'Stok belum dicantumkan'}
                        </small>
                        {(() => {
                          const currentFormat = formatName(format);
                          const currentStock = Number(format.stock);
                          const inCart = cart.find((item) => (
                            String(item.productId) === String(selectedProduct.id)
                            && item.format === currentFormat
                          ))?.quantity || 0;
                          const canAdd = Number.isInteger(currentStock)
                            && currentStock > inCart
                            && inCart < 10;
                          return (
                            <button
                              className="button button-outline migration-add-to-cart"
                              type="button"
                              disabled={!canAdd}
                              onClick={() => {
                                const result = onAddToCart(selectedProduct, currentFormat);
                                setCartNotice(result.message);
                                setMiniCartOpen(result.ok);
                              }}
                            >
                              {canAdd ? 'Tambah ke keranjang' : 'Tidak tersedia'}
                            </button>
                          );
                        })()}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>Informasi format belum tersedia.</p>
              )}
              {selectedProduct.tracklist && (
                <>
                  <h3>Tracklist</h3>
                  <p className="migration-tracklist">{selectedProduct.tracklist}</p>
                </>
              )}
              {selectedProduct.audio_url && (
                <div className="migration-audio-preview">
                  <audio
                    controls
                    preload="none"
                    src={selectedProduct.audio_url}
                    onTimeUpdate={(event) => {
                      if (event.currentTarget.currentTime >= 30) {
                        event.currentTarget.pause();
                        event.currentTarget.currentTime = 0;
                      }
                    }}
                  />
                  <small>Pratinjau audio dibatasi hingga 30 detik.</small>
                </div>
              )}
              <section className="migration-product-reviews" aria-labelledby="migration-review-heading">
                <h3 id="migration-review-heading">Ulasan pembeli</h3>
                {selectedProduct.review_count > 0 ? (
                  <p className="migration-review-summary">
                    ★ {selectedProduct.average_rating} dari 5 · {selectedProduct.review_count} ulasan terverifikasi
                  </p>
                ) : <p>Belum ada ulasan terverifikasi.</p>}
                {reviewsError && <p className="migration-state migration-state-error" role="alert">{reviewsError}</p>}
                {!reviewsError && reviews.length === 0 && selectedProduct.review_count > 0 && (
                  <p>Ulasan terverifikasi belum dapat ditampilkan saat ini.</p>
                )}
                {reviews.map((review, index) => (
                  <article className="review-card migration-review-card" key={`${review.created_at}-${index}`}>
                    <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
                    <p>{review.comment}</p>
                    <small>Pembelian terverifikasi · {new Date(review.created_at).toLocaleDateString('id-ID')}</small>
                  </article>
                ))}
                <p className="migration-preview-note">Ulasan dikirim oleh pembeli dengan pesanan selesai dan ditinjau sebelum ditampilkan.</p>
              </section>
              {relatedProducts.length > 0 && (
                <section className="detail-section related-section">
                  <span className="eyebrow">MASIH SATU VIBE</span>
                  <h3>Album terkait</h3>
                  <div className="related-grid">
                    {relatedProducts.map((product) => (
                      <a
                        className="related-card"
                        href="/?page=catalog"
                        key={product.id}
                        onClick={(event) => {
                          event.preventDefault();
                          selectProduct(product);
                        }}
                      >
                        {product.images?.[0] && <img src={product.images[0]} alt={`Sampul ${product.title}`} loading="lazy" />}
                        <strong>{product.title}</strong>
                        <span>{product.artist}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )}
              {cartNotice && <p className="migration-cart-notice" role="status">{cartNotice}</p>}
              <p className="migration-preview-note">
                Harga dan stok diverifikasi kembali oleh server saat checkout.
              </p>
              {settings?.whatsapp_phone && (
                <a
                  className="button button-outline"
                  href={`https://wa.me/${settings.whatsapp_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Halo, saya ingin bertanya tentang ${selectedProduct.artist} — ${selectedProduct.title}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Tanya via WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </dialog>

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Cari rilisan">
          <button className="close-search" type="button" aria-label="Tutup pencarian" onClick={() => setSearchOpen(false)}>Tutup</button>
          <label htmlFor="site-search">Cari yang lagi kamu bayangin...</label>
          <input
            ref={searchInput}
            id="site-search"
            type="search"
            placeholder="Judul, artis, genre..."
            value={overlaySearch}
            onChange={(event) => setOverlaySearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && overlaySearch.trim()) window.location.href = searchCatalogHref;
            }}
          />
          <div className="search-results">
            {overlaySearch.trim().length >= 2 && !overlayProducts.length && (
              <p>Tidak ada rilisan yang cocok. Coba kata lain?</p>
            )}
            {overlayProducts.map((product) => (
              <a
                href="/?page=catalog#shop"
                key={product.id}
                onClick={(event) => {
                  event.preventDefault();
                  setSearchOpen(false);
                  selectProduct(product);
                }}
              >
                {product.title} <small>· {product.artist}</small>
              </a>
            ))}
            {overlayProducts.length > 0 && <a className="search-all-results" href={searchCatalogHref}>Lihat semua hasil ↗</a>}
          </div>
        </div>
      )}

      {miniCartOpen && (
        <aside className="mini-cart open" aria-live="polite">
          <button className="cart-close" type="button" aria-label="Tutup keranjang" onClick={() => setMiniCartOpen(false)}>Tutup</button>
          <span className="eyebrow">KERANJANG DIPERBARUI</span>
          <p className="cart-message">{cartNotice || 'Rilisan siap menemani sesi dengarmu.'}</p>
          <a className="button button-dark" href="/?page=cart">Lihat keranjang</a>
        </aside>
      )}

      <footer className="footer" id="contact">
        <div className="footer-main">
          <div className="footer-brand">
            <a className="brand" href="/"><img className="brand-logo-default" src={wordmark} alt="RockMerch" /></a>
            <p>Tempat kecil buat jatuh cinta lagi sama musik. Mampir, ngobrol, dan dengar satu album.</p>
            <div className="socials">
              {settings?.instagram && <a href={settings.instagram} target="_blank" rel="noopener noreferrer">Instagram ↗</a>}
              {settings?.tiktok && <a href={settings.tiktok} target="_blank" rel="noopener noreferrer">TikTok ↗</a>}
              {settings?.whatsapp_phone && <a href={`https://wa.me/${settings.whatsapp_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}
            </div>
          </div>
          <div>
            <span className="eyebrow">MAMPIR / SAY HELLO</span>
            {settings?.address && <p>{settings.address}</p>}
            {settings?.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
            {settings?.opening_hours && <p>{settings.opening_hours}</p>}
          </div>
          <div>
            <span className="eyebrow">KELILING RAK</span>
            <a href="/?page=catalog">Semua rilisan</a>
            <a href="/?page=company">Tentang Kami</a>
            <a href="/?page=policies">Info belanja</a>
            <a href="/#club">Record Club</a>
            <a href="/#trade">Jual / Trade-in</a>
            <a href="/#notes">Liner Notes</a>
            <a href="/?page=order">Lacak pesanan</a>
            <a href="/?page=install">Pasang App</a>
          </div>
          <div>
            <span className="eyebrow">DENGARIN DULU</span>
            {settings?.playlist && <a className="playlist-box" href={settings.playlist} target="_blank" rel="noopener noreferrer">♫ &nbsp;Playlist teman rak <span>↗</span></a>}
            <p className="playlist-note">Pilihan lagu yang sering muter di toko.</p>
            <a href="/?page=company-profile">Company Profile ↗</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {settings?.company_name || 'RockMerch'}. Dibuat sambil mendengarkan.</span>
          <span>Bekasi, Indonesia <span className="sun-dot">✳</span></span>
          <a href="/?page=policies">Pengiriman · Pembayaran · Retur · Privasi</a>
        </div>
      </footer>
    </>
  );
}
