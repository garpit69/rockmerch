import { useEffect, useMemo, useState } from 'react';
import { getProductFormat, money } from './store.js';

export default function CartPage({ cart, cartError, onCartChange }) {
  const [products, setProducts] = useState([]);
  const [catalogState, setCatalogState] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/products', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
        return response.json();
      })
      .then(({ products: loadedProducts }) => {
        if (!Array.isArray(loadedProducts)) throw new Error('Catalog response is invalid.');
        setProducts(loadedProducts);
        setCatalogState('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Could not refresh cart products.', error);
          setCatalogState('unavailable');
        }
      });
    return () => controller.abort();
  }, []);

  const lines = useMemo(() => cart.map((item) => {
    const product = products.find((entry) => String(entry.id) === String(item.productId));
    const format = getProductFormat(product, item.format);
    const hasStock = format?.stock !== undefined && format?.stock !== null;
    const stock = hasStock ? Math.max(0, Number(format.stock) || 0) : null;
    return {
      ...item,
      product,
      formatData: format,
      stock,
      unitPrice: Number(format?.price),
      available: Boolean(product && format && hasStock && stock >= item.quantity),
    };
  }), [cart, products]);
  const subtotal = lines.reduce(
    (total, line) => total + ((Number.isFinite(line.unitPrice) ? line.unitPrice : 0) * line.quantity),
    0,
  );
  const cartHasUnavailableItems = lines.some((line) => !line.available);

  const changeQuantity = (line, quantity) => {
    onCartChange(cart.map((item) => (
      item.productId === line.productId && item.format === line.format
        ? { ...item, quantity }
        : item
    )));
  };
  const removeLine = (line) => onCartChange(cart.filter((item) => (
    item.productId !== line.productId || item.format !== line.format
  )));
  const clearCart = () => onCartChange([]);

  return (
    <main className="migration-commerce-page">
      <a className="back-link" href="/#rilisan">← Kembali ke katalog</a>
      <h1>Keranjang belanja</h1>
      {cartError && <p className="migration-state migration-state-error" role="alert">{cartError}</p>}
      {catalogState === 'loading' && <p className="migration-state" role="status">Memeriksa harga dan stok terbaru…</p>}
      {catalogState === 'unavailable' && (
        <p className="migration-state migration-state-error" role="alert">
          Katalog tidak dapat diperiksa. Coba muat ulang sebelum checkout.
        </p>
      )}
      {catalogState === 'ready' && !cart.length && (
        <section className="empty-state">
          <h2>Keranjang masih kosong.</h2>
          <p>Pilih rilisan dari katalog untuk mulai belanja.</p>
          {cartError && (
            <button className="button button-outline" type="button" onClick={clearCart}>
              Hapus keranjang tersimpan
            </button>
          )}
          <a className="button button-dark" href="/#rilisan">Lihat katalog</a>
        </section>
      )}
      {catalogState === 'ready' && cart.length > 0 && (
        <div className="cart-layout">
          <div className="cart-lines">
            {lines.map((line) => (
              <article className="cart-line migration-cart-line" key={`${line.productId}|${line.format}`}>
                {line.product?.images?.[0]
                  ? <img src={line.product.images[0]} alt={`Sampul ${line.product.title}`} />
                  : <div className="migration-cart-image">ROCKMERCH</div>}
                <div className="cart-line-info">
                  <h2>{line.product?.title || 'Rilisan tidak tersedia'}</h2>
                  <p>{line.product?.artist || ''} · {line.format}</p>
                  <small>
                    {line.available
                      ? `${money(line.unitPrice)} per item · stok ${line.stock}`
                      : 'Produk atau jumlah stok tidak lagi tersedia.'}
                  </small>
                </div>
                <label>
                  Jumlah
                  <select
                    value={line.quantity}
                    disabled={line.stock === null || line.stock < 1}
                    onChange={(event) => changeQuantity(line, Number(event.target.value))}
                  >
                    {Array.from({ length: Math.min(10, line.stock || 0) }, (_, index) => index + 1)
                      .map((quantity) => (
                        <option key={quantity} value={quantity}>{quantity}</option>
                      ))}
                    {line.stock !== null && line.quantity > line.stock && (
                      <option value={line.quantity}>{line.quantity} · melebihi stok</option>
                    )}
                  </select>
                </label>
                <strong>{money((Number.isFinite(line.unitPrice) ? line.unitPrice : 0) * line.quantity)}</strong>
                <button className="text-button" type="button" onClick={() => removeLine(line)}>
                  Hapus
                </button>
              </article>
            ))}
          </div>
          <aside className="cart-summary">
            <h2>Ringkasan pesanan</h2>
            <p><span>Subtotal sementara</span><strong>{money(subtotal)}</strong></p>
            <small>Ongkir dan total akhir dihitung ulang oleh server saat checkout.</small>
            {cartHasUnavailableItems && (
              <p className="migration-state-error" role="alert">
                Perbarui atau hapus item yang stoknya tidak cukup sebelum checkout.
              </p>
            )}
            {cartError && (
              <button className="button button-outline full-width" type="button" onClick={clearCart}>
                Hapus keranjang tersimpan
              </button>
            )}
            <a
              className={`button button-dark full-width${cartHasUnavailableItems || cartError ? ' migration-disabled-link' : ''}`}
              href="/?page=checkout"
              aria-disabled={cartHasUnavailableItems || Boolean(cartError)}
              onClick={(event) => {
                if (cartHasUnavailableItems || cartError) event.preventDefault();
              }}
            >
              Lanjut ke checkout
            </a>
          </aside>
        </div>
      )}
    </main>
  );
}
