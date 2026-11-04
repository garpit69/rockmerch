import { useEffect, useState } from 'react';
import { money } from './store.js';

const statusLabels = {
  awaiting_payment: 'Menunggu pembayaran',
  awaiting_confirmation: 'Menunggu konfirmasi',
  confirmed: 'Terkonfirmasi',
  packing: 'Sedang disiapkan',
  shipped: 'Dikirim',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export default function OrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewNotice, setReviewNotice] = useState('');

  const lookup = async (event) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/order-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: orderNumber, email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Pesanan tidak dapat ditemukan.');
      setOrder(body.order);
      setReviewNotice('');
    } catch (requestError) {
      setError(requestError.message);
      if (!order) console.error('Order lookup failed.', requestError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!order) return undefined;
    const timer = window.setInterval(() => {
      lookup();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [order?.order_number, email]);

  const submitReview = async (event, item) => {
    event.preventDefault();
    const draft = reviewDrafts[item.id] || { rating: '', comment: '' };
    setError('');
    setReviewNotice('');
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: order.order_number,
          email,
          order_item_id: item.id,
          rating: Number(draft.rating),
          comment: draft.comment,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Ulasan belum dapat dikirim.');
      setOrder((current) => ({
        ...current,
        items: current.items.map((entry) => (
          entry.id === item.id ? { ...entry, review_status: 'pending' } : entry
        )),
      }));
      setReviewNotice('Terima kasih. Ulasanmu menunggu moderasi toko.');
    } catch (requestError) {
      console.error('Review submission failed.', requestError);
      setError(requestError.message);
    }
  };

  return (
    <main className="migration-commerce-page order-page">
      <a className="back-link" href="/">← Kembali ke toko</a>
      <span className="eyebrow">CEK STATUS PESANAN</span>
      <h1>{order ? 'Status pesanan' : 'Masukkan nomor pesanan Anda'}</h1>
      {!order && (
        <>
          <p>Untuk melihat status, pelacakan, dan instruksi pembayaran, masukkan nomor pesanan serta email saat checkout.</p>
          <form className="checkout-form order-lookup-form" onSubmit={lookup}>
            <label>Nomor pesanan
              <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="RM-123456-ABCDEF1234" required />
            </label>
            <label>Email checkout
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <button className="button button-dark" disabled={loading}>{loading ? 'Memeriksa…' : 'Cek status pesanan'}</button>
          </form>
        </>
      )}
      {error && <p className="migration-state migration-state-error" role="alert">{error}</p>}
      {reviewNotice && <p className="migration-cart-notice" role="status">{reviewNotice}</p>}
      {order && (
        <>
          <p>Terima kasih, <strong>{order.customer_name}</strong>. Simpan nomor pesanan <strong>{order.order_number}</strong>.</p>
          <section className="cart-summary migration-order-confirmation">
            <p><span>Status</span><strong>{statusLabels[order.status] || order.status}</strong></p>
            {order.items.map((item) => (
              <p key={item.id}><span>{item.title} · {item.format} × {item.quantity}</span><strong>{money(Number(item.unit_price) * item.quantity)}</strong></p>
            ))}
            <p><span>Subtotal</span><strong>{money(Number(order.subtotal))}</strong></p>
            <p><span>Pengiriman</span><strong>{money(Number(order.shipping))}</strong></p>
            <p className="summary-total"><span>Total</span><strong>{money(Number(order.total))}</strong></p>
            {order.payment_method === 'bank_transfer' && (
              <div className="payment-instructions">
                <h2>Instruksi transfer</h2>
                {order.transfer_bank_account
                  ? <p>Transfer tepat sejumlah <strong>{money(Number(order.total))}</strong> ke {order.transfer_bank_code.toUpperCase()} · <strong>{order.transfer_bank_account}</strong> · a.n. {order.transfer_account_name}.</p>
                  : <p>Detail rekening tidak tersimpan pada pesanan ini. Hubungi toko untuk konfirmasi.</p>}
                <small>Admin memverifikasi pembayaran secara manual.</small>
              </div>
            )}
            {order.payment_method === 'cod' && <div className="payment-instructions"><h2>Pembayaran COD</h2><p>Pesanan menunggu konfirmasi toko terkait layanan COD.</p></div>}
            {order.payment_method === 'midtrans' && <div className="payment-instructions"><h2>Pembayaran online</h2>{order.payment_url && <a className="button button-dark" href={order.payment_url} target="_blank" rel="noopener noreferrer">Lanjutkan pembayaran</a>}</div>}
            {order.tracking_number && <p><span>Kurir / resi</span><strong>{order.shipping_carrier} · {order.tracking_number}</strong></p>}
            {order.tracking_url && <p><a href={order.tracking_url} target="_blank" rel="noopener noreferrer">Lacak pengiriman ↗</a></p>}
          </section>
          {order.status === 'completed' && (
            <section className="order-review-section">
              <h2>Bagikan pengalaman belanja</h2>
              <p>Ulasan untuk item pesanan selesai akan ditinjau sebelum ditampilkan.</p>
              {order.items.filter((item) => item.product_id).map((item) => (
                <article className="order-review-item" key={item.id}>
                  <h3>{item.title} · {item.format}</h3>
                  {item.review_status ? (
                    <p>{item.review_status === 'published' ? 'Ulasanmu sudah ditampilkan.' : 'Ulasan sudah dikirim dan menunggu moderasi.'}</p>
                  ) : (
                    <form className="checkout-form" onSubmit={(event) => submitReview(event, item)}>
                      <label>Rating
                        <select required value={reviewDrafts[item.id]?.rating || ''} onChange={(event) => setReviewDrafts((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], rating: event.target.value },
                        }))}>
                          <option value="">Pilih rating</option>
                          {[5, 4, 3, 2, 1].map((rating) => <option value={rating} key={rating}>{rating} dari 5 bintang</option>)}
                        </select>
                      </label>
                      <label>Ulasan
                        <textarea minLength="10" maxLength="1000" required rows="4" value={reviewDrafts[item.id]?.comment || ''} onChange={(event) => setReviewDrafts((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], comment: event.target.value },
                        }))} />
                      </label>
                      <button className="button button-dark">Kirim ulasan</button>
                    </form>
                  )}
                </article>
              ))}
            </section>
          )}
          <button className="button button-outline" type="button" onClick={() => { setOrder(null); setError(''); }}>Cek pesanan lain</button>
        </>
      )}
    </main>
  );
}
