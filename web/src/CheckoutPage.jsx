import { useEffect, useMemo, useState } from 'react';
import { getProductFormat, money } from './store.js';

const initialForm = {
  customer_name: '',
  email: '',
  phone: '',
  postal_code: '',
  address: '',
  city: '',
  notes: '',
  bank_code: '',
};

export default function CheckoutPage({ cart, cartError, onCartChange }) {
  const [products, setProducts] = useState([]);
  const [checkoutConfig, setCheckoutConfig] = useState(null);
  const [pageError, setPageError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [catalogState, setCatalogState] = useState('loading');
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/products', { signal: controller.signal }),
      fetch('/api/checkout-config', { signal: controller.signal }),
    ])
      .then(async ([productsResponse, configResponse]) => {
        if (!productsResponse.ok || !configResponse.ok) {
          throw new Error('Katalog atau konfigurasi checkout tidak dapat dimuat.');
        }
        const [productsBody, configBody] = await Promise.all([
          productsResponse.json(),
          configResponse.json(),
        ]);
        if (!Array.isArray(productsBody.products) || !Array.isArray(configBody.banks)) {
          throw new Error('Data checkout dari server tidak valid.');
        }
        setProducts(productsBody.products);
        setCheckoutConfig(configBody);
        setForm((current) => ({
          ...current,
          bank_code: current.bank_code || configBody.banks[0]?.code || '',
        }));
        setCatalogState('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Could not load checkout data.', error);
          setPageError(error.message);
          setCatalogState('unavailable');
        }
      });
    return () => controller.abort();
  }, []);

  const lines = useMemo(() => cart.map((item) => {
    const product = products.find((entry) => String(entry.id) === String(item.productId));
    const format = getProductFormat(product, item.format);
    const stock = format?.stock === undefined || format?.stock === null
      ? null
      : Math.max(0, Number(format.stock) || 0);
    return {
      ...item,
      title: product?.title || 'Rilisan tidak tersedia',
      unitPrice: Number(format?.price),
      stock,
      available: Boolean(product && format && stock !== null && stock >= item.quantity),
    };
  }), [cart, products]);
  const subtotal = lines.reduce(
    (total, line) => total + ((Number.isFinite(line.unitPrice) ? line.unitPrice : 0) * line.quantity),
    0,
  );
  const shipping = checkoutConfig
    ? (subtotal >= checkoutConfig.freeShippingThreshold ? 0 : checkoutConfig.shippingFee)
    : 0;
  const unavailableItems = lines.some((line) => !line.available);

  const updateForm = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    if (!cart.length || unavailableItems || !checkoutConfig?.banks.length) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const requestKeyName = 'rm-checkout-idempotency';
      let idempotencyKey = sessionStorage.getItem(requestKeyName);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        sessionStorage.setItem(requestKeyName, idempotencyKey);
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          idempotency_key: idempotencyKey,
          items: cart.map((item) => ({
            product_id: item.productId,
            format: item.format,
            quantity: item.quantity,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Pesanan belum dapat dibuat.');
      setOrder(body.order);
      sessionStorage.removeItem(requestKeyName);
      onCartChange([]);
    } catch (error) {
      console.error('Checkout submission failed.', error);
      setSubmitError(error.message || 'Pesanan belum dapat dibuat. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (order) {
    return (
      <main className="migration-commerce-page">
        <span className="eyebrow">PESANAN TERCATAT</span>
        <h1>Terima kasih, pesananmu masuk.</h1>
        <section className="cart-summary migration-order-confirmation">
          <p>Nomor pesanan <strong>{order.order_number}</strong></p>
          <p><span>Status</span><strong>Menunggu pembayaran</strong></p>
          <p><span>Total transfer</span><strong>{money(order.total)}</strong></p>
          <p>
            <span>Transfer ke {order.transfer_bank_code.toUpperCase()}</span>
            <strong>{order.transfer_bank_account}</strong>
          </p>
          <p><span>Atas nama</span><strong>{order.transfer_account_name}</strong></p>
          <p className="migration-preview-note">
            Simpan nomor pesanan dan bukti transfer. Email konfirmasi belum aktif pada pratinjau ini.
          </p>
          <a className="button button-dark" href="/">Kembali ke katalog</a>
        </section>
      </main>
    );
  }

  if (!cart.length && catalogState === 'ready') {
    return (
      <main className="migration-commerce-page">
        <h1>Keranjang masih kosong.</h1>
        <a className="button button-dark" href="/#rilisan">Kembali ke katalog</a>
      </main>
    );
  }

  return (
    <main className="migration-commerce-page">
      <a className="back-link" href="/?page=cart">← Kembali ke keranjang</a>
      <h1>Detail pengiriman</h1>
      {cartError && <p className="migration-state migration-state-error" role="alert">{cartError}</p>}
      {pageError && <p className="migration-state migration-state-error" role="alert">{pageError}</p>}
      {catalogState === 'loading' && <p className="migration-state" role="status">Menyiapkan checkout…</p>}
      {catalogState === 'ready' && (
        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={submitOrder}>
            <div className="form-grid">
              <label>Nama penerima *
                <input name="customer_name" maxLength="160" autoComplete="name" required value={form.customer_name} onChange={updateForm} />
              </label>
              <label>Email *
                <input type="email" name="email" maxLength="254" autoComplete="email" required value={form.email} onChange={updateForm} />
              </label>
              <label>Nomor WhatsApp *
                <input type="tel" name="phone" maxLength="40" autoComplete="tel" required value={form.phone} onChange={updateForm} />
              </label>
              <label>Kode pos *
                <input name="postal_code" maxLength="20" autoComplete="postal-code" required value={form.postal_code} onChange={updateForm} />
              </label>
              <label className="span-2">Alamat lengkap *
                <textarea name="address" maxLength="1000" autoComplete="street-address" rows="3" required value={form.address} onChange={updateForm} />
              </label>
              <label>Kota / Kabupaten *
                <input name="city" maxLength="120" autoComplete="address-level2" required value={form.city} onChange={updateForm} />
              </label>
              <label>Catatan untuk toko
                <textarea name="notes" maxLength="1000" rows="2" value={form.notes} onChange={updateForm} />
              </label>
            </div>
            <fieldset>
              <legend>Metode pembayaran</legend>
              {checkoutConfig.banks.length ? (
                <label>
                  Rekening tujuan
                  <select name="bank_code" required value={form.bank_code} onChange={updateForm}>
                    {checkoutConfig.banks.map((bank) => (
                      <option value={bank.code} key={bank.code}>{bank.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="migration-state migration-state-error">
                  Transfer bank belum dikonfigurasi. Admin perlu mengisi BANK_ACCOUNTS_JSON
                  pada environment lokal/Netlify sebelum checkout dapat digunakan.
                </p>
              )}
              <p className="checkout-note">Pesanan menunggu verifikasi transfer manual oleh toko.</p>
            </fieldset>
            {submitError && <p className="migration-state migration-state-error" role="alert">{submitError}</p>}
            {unavailableItems && (
              <p className="migration-state migration-state-error" role="alert">
                Stok salah satu produk tidak tersedia. Kembali ke keranjang untuk memperbarui.
              </p>
            )}
            <button
              className="button button-dark"
              disabled={submitting || unavailableItems || !checkoutConfig.banks.length || Boolean(cartError)}
            >
              {submitting ? 'Membuat pesanan…' : `Buat pesanan · ${money(subtotal + shipping)}`}
            </button>
          </form>
          <aside className="cart-summary">
            <h2>Pesananmu</h2>
            {lines.map((line) => (
              <p key={`${line.productId}|${line.format}`}>
                <span>{line.title} ({line.format}) × {line.quantity}</span>
                <strong>{money((Number.isFinite(line.unitPrice) ? line.unitPrice : 0) * line.quantity)}</strong>
              </p>
            ))}
            <p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
            <p><span>Pengiriman</span><strong>{shipping ? money(shipping) : 'Gratis'}</strong></p>
            <p className="summary-total"><span>Total</span><strong>{money(subtotal + shipping)}</strong></p>
          </aside>
        </div>
      )}
    </main>
  );
}
