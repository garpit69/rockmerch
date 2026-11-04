import { useCallback, useEffect, useState } from 'react';
import { getAllowedOrderStatuses, orderStatuses } from '../../lib/order-statuses.mjs';
import {
  AdminAnalytics,
  AdminActivity,
  AdminArticles,
  AdminBackups,
  AdminOverview,
  AdminReviews,
  AdminSettings,
  AdminUsers,
} from './AdminSections.jsx';
import { money } from './store.js';

const emptyProduct = () => ({
  title: '',
  artist: '',
  genre: '',
  year: '',
  label: '',
  condition_name: 'Mint',
  description: '',
  tracklist: '',
  images_text: '',
  status: 'draft',
  featured: false,
  merchandise: false,
  formats: [{ format: 'Vinyl', price: '', stock: '' }],
});

export default function AdminPage() {
  const [authState, setAuthState] = useState('loading');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [articles, setArticles] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [settings, setSettings] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [activities, setActivities] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAdminData = useCallback(async (currentUser) => {
    const paths = ['/api/admin/products', '/api/admin/articles'];
    if (currentUser?.role === 'admin') {
      paths.push(
        '/api/admin/orders',
        '/api/admin/overview',
        '/api/admin/reviews',
        '/api/admin/settings',
        '/api/admin/users',
        '/api/admin/analytics',
        '/api/admin/activity',
      );
    }
    const results = await Promise.all(paths.map(async (path) => {
      const response = await fetch(path);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Data admin tidak dapat dimuat.');
      return [path, body];
    }));
    const data = Object.fromEntries(results);
    setProducts(data['/api/admin/products'].products);
    setArticles(data['/api/admin/articles'].articles);
    if (currentUser?.role === 'admin') {
      setOrders(data['/api/admin/orders'].orders);
      setOverview(data['/api/admin/overview']);
      setReviews(data['/api/admin/reviews'].reviews);
      setSettings(data['/api/admin/settings'].settings);
      setStaffUsers(data['/api/admin/users'].users);
      setCurrentUserId(data['/api/admin/users'].current_user_id);
      setAnalytics(data['/api/admin/analytics']);
      setActivities(data['/api/admin/activity'].activities);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/auth')
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) return null;
        if (!response.ok) throw new Error(body.error || 'Sesi admin tidak dapat diperiksa.');
        return body.user;
      })
      .then(async (currentUser) => {
        if (!active) return;
        if (!currentUser) {
          setAuthState('signed-out');
          return;
        }
        setUser(currentUser);
        await loadAdminData(currentUser);
        if (active) setAuthState('signed-in');
      })
      .catch((requestError) => {
        if (active) {
          console.error('Admin initialization failed.', requestError);
          setError(requestError.message);
          setAuthState('unavailable');
        }
      });
    return () => { active = false; };
  }, [loadAdminData]);

  const signIn = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Tidak dapat masuk.');
      setUser(body.user);
      setPassword('');
      await loadAdminData(body.user);
      setAuthState('signed-in');
    } catch (requestError) {
      console.error('Admin sign-in failed.', requestError);
      setError(requestError.message || 'Tidak dapat masuk.');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth', { method: 'DELETE' });
      if (!response.ok) throw new Error('Sesi admin tidak dapat diakhiri.');
      setUser(null);
      setProducts([]);
      setOrders([]);
      setArticles([]);
      setReviews([]);
      setStaffUsers([]);
      setOverview(null);
      setSettings({});
      setAnalytics(null);
      setActivities([]);
      setCurrentUserId(null);
      setTab('products');
      setNotice('');
      setAuthState('signed-out');
    } catch (requestError) {
      console.error('Admin sign-out failed.', requestError);
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = {
        ...productForm,
        ...(editingProductId ? { id: editingProductId } : {}),
        images: productForm.images_text.split(/\r?\n/).map((image) => image.trim()).filter(Boolean),
        formats: productForm.formats.map((format) => ({
          format: format.format,
          price: Number(format.price),
          stock: Number(format.stock),
        })),
      };
      delete body.images_text;
      const response = await fetch('/api/admin/products', {
        method: editingProductId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Produk belum dapat disimpan.');
      await loadAdminData(user);
      setProductForm(emptyProduct());
      setEditingProductId(null);
      setNotice('Produk berhasil disimpan.');
    } catch (requestError) {
      console.error('Admin product save failed.', requestError);
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      ...emptyProduct(),
      ...product,
      images_text: Array.isArray(product.images) ? product.images.join('\n') : '',
      formats: (Array.isArray(product.formats) ? product.formats : []).map((format) => ({
        format: format.format || format.name || 'Vinyl',
        price: String(format.price ?? ''),
        stock: String(format.stock ?? ''),
      })),
    });
    setTab('products');
  };

  const updateOrder = async (event, order) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          status: formData.get('status'),
          shipping_carrier: formData.get('shipping_carrier'),
          tracking_number: formData.get('tracking_number'),
          tracking_url: formData.get('tracking_url'),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Pesanan belum dapat diperbarui.');
      await loadAdminData(user);
      setNotice(`Pesanan ${order.order_number} berhasil diperbarui.`);
    } catch (requestError) {
      console.error('Admin order update failed.', requestError);
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveArticle = async (article) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/articles', {
        method: article.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Artikel belum dapat disimpan.');
      await loadAdminData(user);
      setNotice('Artikel berhasil disimpan.');
      return true;
    } catch (requestError) {
      console.error('Admin article save failed.', requestError);
      setError(requestError.message || 'Artikel belum dapat disimpan.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (article) => {
    if (!window.confirm(`Hapus artikel "${article.title}"?`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/articles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Artikel belum dapat dihapus.');
      await loadAdminData(user);
      setNotice('Artikel berhasil dihapus.');
    } catch (requestError) {
      console.error('Admin article delete failed.', requestError);
      setError(requestError.message || 'Artikel belum dapat dihapus.');
    } finally {
      setSaving(false);
    }
  };

  const moderateReview = async (review, status) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Ulasan belum dapat diperbarui.');
      await loadAdminData(user);
      setNotice(`Ulasan berhasil ${status === 'published' ? 'diterbitkan' : 'ditolak'}.`);
    } catch (requestError) {
      console.error('Admin review moderation failed.', requestError);
      setError(requestError.message || 'Ulasan belum dapat diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (nextSettings) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Pengaturan toko belum dapat disimpan.');
      await loadAdminData(user);
      setNotice('Pengaturan toko berhasil disimpan.');
    } catch (requestError) {
      console.error('Admin settings save failed.', requestError);
      setError(requestError.message || 'Pengaturan toko belum dapat disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const saveStaffUser = async (staff) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: staff.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staff),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Akun staf belum dapat disimpan.');
      await loadAdminData(user);
      setNotice(staff.id ? 'Akun staf berhasil diperbarui.' : 'Akun staf berhasil ditambahkan.');
      return true;
    } catch (requestError) {
      console.error('Admin staff save failed.', requestError);
      setError(requestError.message || 'Akun staf belum dapat disimpan.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteStaffUser = async (staff) => {
    if (!window.confirm(`Hapus akun staf ${staff.email}?`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staff.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Akun staf belum dapat dihapus.');
      await loadAdminData(user);
      setNotice('Akun staf berhasil dihapus.');
    } catch (requestError) {
      console.error('Admin staff delete failed.', requestError);
      setError(requestError.message || 'Akun staf belum dapat dihapus.');
    } finally {
      setSaving(false);
    }
  };

  const runProductAction = async (product, action) => {
    const message = action === 'archive'
      ? `Arsipkan produk "${product.title}"?`
      : `Buat salinan draft dari "${product.title}"?`;
    if (!window.confirm(message)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Produk belum dapat diperbarui.');
      await loadAdminData(user);
      setNotice(action === 'archive' ? 'Produk berhasil diarsipkan.' : 'Draft salinan produk berhasil dibuat.');
    } catch (requestError) {
      console.error('Admin product action failed.', requestError);
      setError(requestError.message || 'Produk belum dapat diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  const downloadBackup = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/backup');
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Backup belum dapat diunduh.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rockmerch-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Backup berhasil diunduh. Simpan file dengan aman karena memuat data pesanan pelanggan.');
    } catch (requestError) {
      console.error('Admin backup download failed.', requestError);
      setError(requestError.message || 'Backup belum dapat diunduh.');
    } finally {
      setSaving(false);
    }
  };

  const tabs = user?.role === 'admin'
    ? [
      ['overview', 'Ringkasan'],
      ['products', `Produk (${products.length})`],
      ['orders', `Pesanan (${orders.length})`],
      ['articles', `Artikel (${articles.length})`],
      ['reviews', `Ulasan (${reviews.length})`],
      ['settings', 'Pengaturan'],
      ['users', 'Akun staf'],
      ['analytics', 'Analitik'],
      ['backup', 'Backup'],
      ['activity', 'Aktivitas'],
    ]
    : [
      ['products', `Produk (${products.length})`],
      ['articles', `Artikel (${articles.length})`],
    ];

  if (authState === 'loading') {
    return <main className="migration-commerce-page"><p role="status">Memeriksa sesi admin…</p></main>;
  }

  if (authState === 'unavailable') {
    return (
      <main className="migration-commerce-page">
        <h1>Panel admin belum tersedia.</h1>
        <p className="migration-state migration-state-error" role="alert">
          {error || 'Pastikan migrasi database admin sudah diterapkan.'}
        </p>
        <a className="button button-outline" href="/">Kembali ke toko</a>
      </main>
    );
  }

  if (authState === 'signed-out') {
    return (
      <main className="migration-commerce-page migration-admin-login">
        <a className="back-link" href="/">← Kembali ke toko</a>
        <span className="eyebrow">RUANG KERJA ROCKMERCH</span>
        <h1>Masuk ke ruang kerja.</h1>
        <p>Gunakan akun admin atau editor yang dibuat oleh admin toko.</p>
        {error && <p className="migration-state migration-state-error" role="alert">{error}</p>}
        <form className="checkout-form" onSubmit={signIn}>
          <label>Email
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>Kata sandi
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button button-dark" disabled={saving}>
            {saving ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
        <a className="back-link" href="/?page=admin-reset">Lupa kata sandi?</a>
      </main>
    );
  }

  return (
    <main className="migration-commerce-page migration-admin-page">
      <header className="migration-admin-header">
        <div>
          <span className="eyebrow">RUANG KERJA ROCKMERCH</span>
          <h1>Halo, {user.email}</h1>
        </div>
        <button className="button button-outline" type="button" onClick={signOut} disabled={saving}>
          Keluar
        </button>
      </header>
      <nav className="migration-admin-tabs" aria-label="Menu admin">
        {tabs.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </nav>
      {error && <p className="migration-state migration-state-error" role="alert">{error}</p>}
      {notice && <p className="migration-cart-notice" role="status">{notice}</p>}

      {tab === 'overview' && user.role === 'admin' && (
        <AdminOverview data={overview} onNavigate={setTab} />
      )}

      {tab === 'products' && (
        <div className="migration-admin-content">
          <form className="checkout-form migration-admin-product-form" onSubmit={saveProduct}>
            <h2>{editingProductId ? 'Ubah produk' : 'Tambah produk'}</h2>
            <div className="form-grid">
              <label>Judul *
                <input required maxLength="200" value={productForm.title} onChange={(event) => setProductForm({ ...productForm, title: event.target.value })} />
              </label>
              <label>Artis *
                <input required maxLength="200" value={productForm.artist} onChange={(event) => setProductForm({ ...productForm, artist: event.target.value })} />
              </label>
              <label>Genre
                <input maxLength="100" value={productForm.genre} onChange={(event) => setProductForm({ ...productForm, genre: event.target.value })} />
              </label>
              <label>Tahun
                <input maxLength="20" value={productForm.year} onChange={(event) => setProductForm({ ...productForm, year: event.target.value })} />
              </label>
              <label>Label
                <input maxLength="160" value={productForm.label} onChange={(event) => setProductForm({ ...productForm, label: event.target.value })} />
              </label>
              <label>Kondisi
                <input maxLength="40" value={productForm.condition_name} onChange={(event) => setProductForm({ ...productForm, condition_name: event.target.value })} />
              </label>
              <label>Status
                <select value={productForm.status} onChange={(event) => setProductForm({ ...productForm, status: event.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="published">Dipublikasikan</option>
                </select>
              </label>
              <label className="migration-checkbox">
                <input type="checkbox" checked={productForm.featured} onChange={(event) => setProductForm({ ...productForm, featured: event.target.checked })} />
                Rilisan unggulan
              </label>
              <label className="migration-checkbox">
                <input type="checkbox" checked={productForm.merchandise} onChange={(event) => setProductForm({ ...productForm, merchandise: event.target.checked })} />
                Merchandise
              </label>
              <label className="span-2">Deskripsi
                <textarea maxLength="5000" rows="3" value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} />
              </label>
              <label className="span-2">Tracklist
                <textarea maxLength="5000" rows="3" value={productForm.tracklist} onChange={(event) => setProductForm({ ...productForm, tracklist: event.target.value })} />
              </label>
              <label className="span-2">URL gambar (satu per baris, HTTPS atau path lokal)
                <textarea rows="3" value={productForm.images_text} onChange={(event) => setProductForm({ ...productForm, images_text: event.target.value })} />
              </label>
            </div>
            <section className="migration-admin-formats">
              <h3>Format, harga, dan stok</h3>
              {productForm.formats.map((format, index) => (
                <div className="migration-admin-format-row" key={`format-${index}`}>
                  <select
                    aria-label={`Format produk ${index + 1}`}
                    value={format.format}
                    onChange={(event) => setProductForm({
                      ...productForm,
                      formats: productForm.formats.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, format: event.target.value } : item
                      )),
                    })}
                  >
                    {['Vinyl', 'Kaset', 'CD', 'Merchandise'].map((name) => <option key={name}>{name}</option>)}
                  </select>
                  <input
                    aria-label={`Harga format ${index + 1}`}
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="Harga"
                    value={format.price}
                    onChange={(event) => setProductForm({
                      ...productForm,
                      formats: productForm.formats.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, price: event.target.value } : item
                      )),
                    })}
                  />
                  <input
                    aria-label={`Stok format ${index + 1}`}
                    type="number"
                    min="0"
                    step="1"
                    required
                    placeholder="Stok"
                    value={format.stock}
                    onChange={(event) => setProductForm({
                      ...productForm,
                      formats: productForm.formats.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, stock: event.target.value } : item
                      )),
                    })}
                  />
                  <button
                    className="text-button"
                    type="button"
                    aria-label={`Hapus format ${index + 1}`}
                    disabled={productForm.formats.length <= 1}
                    onClick={() => setProductForm({
                      ...productForm,
                      formats: productForm.formats.filter((_, itemIndex) => itemIndex !== index),
                    })}
                  >
                    Hapus
                  </button>
                </div>
              ))}
              <button
                className="button button-outline"
                type="button"
                disabled={productForm.formats.length >= 10}
                onClick={() => setProductForm({
                  ...productForm,
                  formats: [...productForm.formats, { format: 'Kaset', price: '', stock: '' }],
                })}
              >
                Tambah format
              </button>
            </section>
            <div className="migration-admin-actions">
              <button className="button button-dark" disabled={saving}>
                {saving ? 'Menyimpan…' : 'Simpan produk'}
              </button>
              {editingProductId && (
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => { setProductForm(emptyProduct()); setEditingProductId(null); }}
                >
                  Batal
                </button>
              )}
            </div>
          </form>
          <section className="migration-admin-list">
            <h2>Produk tersimpan</h2>
            {products.map((product) => (
              <article key={product.id}>
                <div>
                  <strong>{product.title}</strong>
                  <span>{product.artist} · {product.status}</span>
                  <small>
                    {(Array.isArray(product.formats) ? product.formats : [])
                      .map((format) => `${format.format || format.name}: ${money(Number(format.price) || 0)} · stok ${format.stock ?? '—'}`)
                      .join(' / ')}
                  </small>
                </div>
                <button className="button button-outline" type="button" onClick={() => editProduct(product)}>
                  Ubah
                </button>
                <div className="migration-admin-actions">
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={saving}
                    onClick={() => runProductAction(product, 'duplicate')}
                  >
                    Duplikasi
                  </button>
                  {product.status !== 'archived' && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={saving}
                      onClick={() => runProductAction(product, 'archive')}
                    >
                      Arsipkan
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {tab === 'orders' && user.role === 'admin' && (
        <section className="migration-admin-orders">
          {!orders.length && <p className="migration-state">Belum ada pesanan di database.</p>}
          {orders.map((order) => (
            <article className="migration-admin-order" key={order.id}>
              <div className="migration-admin-order-summary">
                <div>
                  <span className="eyebrow">{order.order_number} · {new Date(order.created_at).toLocaleString('id-ID')}</span>
                  <h2>{order.customer_name}</h2>
                  <p>{order.email} · {order.phone}</p>
                  <p>{order.address}, {order.city} {order.postal_code}</p>
                </div>
                <strong>{money(Number(order.total))}</strong>
              </div>
              <ul>
                {order.items.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    {item.title} · {item.format} × {item.quantity}
                  </li>
                ))}
              </ul>
              <form className="checkout-form migration-admin-order-form" onSubmit={(event) => updateOrder(event, order)}>
                <label>Status
                  <select name="status" defaultValue={order.status}>
                    {orderStatuses
                      .filter(([value]) => getAllowedOrderStatuses(order.status).includes(value))
                      .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>Kurir
                  <input name="shipping_carrier" maxLength="80" defaultValue={order.shipping_carrier} />
                </label>
                <label>Nomor resi
                  <input name="tracking_number" maxLength="120" defaultValue={order.tracking_number} />
                </label>
                <label>URL pelacakan (HTTPS)
                  <input type="url" name="tracking_url" maxLength="1000" defaultValue={order.tracking_url} />
                </label>
                <button className="button button-dark" disabled={saving}>
                  Simpan status
                </button>
              </form>
            </article>
          ))}
        </section>
      )}

      {tab === 'articles' && (
        <AdminArticles articles={articles} onSave={saveArticle} onDelete={deleteArticle} saving={saving} />
      )}

      {tab === 'reviews' && user.role === 'admin' && (
        <AdminReviews reviews={reviews} onModerate={moderateReview} saving={saving} />
      )}

      {tab === 'settings' && user.role === 'admin' && (
        <AdminSettings settings={settings} onSave={saveSettings} saving={saving} />
      )}

      {tab === 'users' && user.role === 'admin' && (
        <AdminUsers
          users={staffUsers}
          currentUserId={currentUserId}
          onSave={saveStaffUser}
          onDelete={deleteStaffUser}
          saving={saving}
        />
      )}

      {tab === 'analytics' && user.role === 'admin' && <AdminAnalytics data={analytics} />}

      {tab === 'backup' && user.role === 'admin' && (
        <AdminBackups onDownload={downloadBackup} saving={saving} />
      )}
      {tab === 'activity' && user.role === 'admin' && (
        <AdminActivity activities={activities} />
      )}
      <a className="back-link" href="/">← Kembali ke toko</a>
    </main>
  );
}
