import { useState } from 'react';
import { storeSettingDefaults } from '../../lib/store-settings.mjs';
import { money } from './store.js';

export function AdminOverview({ data, onNavigate }) {
  if (!data) return <p className="migration-state">Memuat ringkasan toko…</p>;
  return (
    <div className="migration-admin-section">
      <section className="migration-admin-stats">
        <article><span>PESANAN MENUNGGU</span><strong>{data.new_order_count}</strong><button type="button" onClick={() => onNavigate('orders')}>Kelola pesanan ↗</button></article>
        <article><span>OMZET HARI INI · SELESAI</span><strong>{money(Number(data.today_revenue))}</strong></article>
        <article><span>OMZET BULAN INI · SELESAI</span><strong>{money(Number(data.month_revenue))}</strong></article>
        <article><span>PRODUK AKTIF</span><strong>{data.product_count}</strong><button type="button" onClick={() => onNavigate('products')}>Kelola produk ↗</button></article>
        <article><span>ARTIKEL</span><strong>{data.article_count}</strong><button type="button" onClick={() => onNavigate('articles')}>Kelola artikel ↗</button></article>
        <article><span>ULASAN MENUNGGU</span><strong>{data.pending_review_count}</strong><button type="button" onClick={() => onNavigate('reviews')}>Moderasi ↗</button></article>
      </section>
      <div className="migration-admin-content">
        <section className="migration-admin-list">
          <h2>Stok menipis (3 atau kurang)</h2>
          {!data.low_stock_products.length && <p>Tidak ada stok menipis.</p>}
          {data.low_stock_products.map((item) => (
            <article key={`${item.id}-${item.format}`}>
              <div><strong>{item.title}</strong><span>{item.artist} · {item.format}</span></div>
              <b>{item.stock} unit</b>
            </article>
          ))}
        </section>
        <section className="migration-admin-list">
          <h2>Produk terlaris · pesanan selesai</h2>
          {!data.best_sellers.length && <p>Belum ada data penjualan selesai.</p>}
          {data.best_sellers.map((item) => <article key={item.title}><strong>{item.title}</strong><b>{item.units} unit</b></article>)}
        </section>
      </div>
    </div>
  );
}

const emptyArticle = {
  title: '',
  slug: '',
  category: '',
  excerpt: '',
  content: '',
  image: '',
  status: 'draft',
  publish_at: '',
};

export function AdminArticles({ articles, onSave, onDelete, saving }) {
  const [form, setForm] = useState(emptyArticle);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const edit = (article) => {
    setEditingId(article.id);
    setForm({
      ...article,
      publish_at: article.publish_at ? new Date(article.publish_at).toISOString().slice(0, 16) : '',
    });
    setShowForm(true);
  };
  const reset = () => {
    setEditingId(null);
    setForm(emptyArticle);
    setShowForm(false);
  };
  const submit = async (event) => {
    event.preventDefault();
    const saved = await onSave({ ...form, id: editingId, publish_at: form.publish_at || null });
    if (saved) reset();
  };

  return (
    <div className="migration-admin-section migration-admin-articles">
      <div className="migration-admin-toolbar">
        <h2>Artikel & Liner Notes</h2>
        <button className="button button-dark" type="button" onClick={() => { reset(); setShowForm(true); }}>Tulis artikel</button>
      </div>
      {showForm && (
        <form className="checkout-form migration-admin-product-form" onSubmit={submit}>
          <h3>{editingId ? 'Ubah artikel' : 'Artikel baru'}</h3>
          <div className="form-grid">
            <label>Judul *
              <input required maxLength="200" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>Slug
              <input maxLength="170" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="dibuat-otomatis-dari-judul" />
            </label>
            <label>Kategori
              <input maxLength="120" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </label>
            <label>Status
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Dipublikasikan</option>
                <option value="scheduled">Terjadwal</option>
              </select>
            </label>
            {form.status === 'scheduled' && (
              <label>Jadwal terbit *
                <input type="datetime-local" required value={form.publish_at} onChange={(event) => setForm({ ...form, publish_at: event.target.value })} />
              </label>
            )}
            <label className="span-2">URL gambar (HTTPS)
              <input type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} />
            </label>
            <label className="span-2">Ringkasan
              <textarea maxLength="600" rows="2" value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} />
            </label>
            <label className="span-2">Isi artikel
              <textarea maxLength="20000" rows="10" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            </label>
          </div>
          <div className="migration-admin-actions">
            <button className="button button-dark" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan artikel'}</button>
            <button className="button button-outline" type="button" onClick={reset}>Batal</button>
          </div>
        </form>
      )}
      <section className="migration-admin-list">
        {articles.map((article) => (
          <article key={article.id}>
            <div><strong>{article.title}</strong><span>{article.slug} · {article.status}</span></div>
            <div className="migration-admin-actions">
              <button className="button button-outline" type="button" onClick={() => edit(article)}>Ubah</button>
              <button className="text-button" type="button" onClick={() => onDelete(article)}>Hapus</button>
            </div>
          </article>
        ))}
        {!articles.length && <p>Belum ada artikel.</p>}
      </section>
    </div>
  );
}

export function AdminReviews({ reviews, onModerate, saving }) {
  return (
    <section className="migration-admin-section migration-admin-list">
      <h2>Moderasi ulasan</h2>
      {!reviews.length && <p>Belum ada ulasan pembeli.</p>}
      {reviews.map((review) => (
        <article className="migration-admin-review" key={review.id}>
          <div>
            <strong>{review.product_title} · {review.format}</strong>
            <span>{review.order_number} · {review.customer_name} · {review.rating}/5</span>
            <p>{review.comment}</p>
            <small>Status: {review.status}</small>
          </div>
          <div className="migration-admin-actions">
            <button className="button button-dark" disabled={saving || review.status === 'published'} onClick={() => onModerate(review, 'published')}>Terbitkan</button>
            <button className="button button-outline" disabled={saving || review.status === 'rejected'} onClick={() => onModerate(review, 'rejected')}>Tolak</button>
          </div>
        </article>
      ))}
    </section>
  );
}

const settingsDefaults = { ...storeSettingDefaults, manual_bank_accounts: '[]' };

export function AdminSettings({ settings, onSave, saving }) {
  const [form, setForm] = useState({ ...settingsDefaults, ...settings });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    await onSave(form);
  };
  return (
    <form className="checkout-form migration-admin-section migration-admin-product-form" onSubmit={save}>
      <h2>Identitas & kontak</h2>
      <div className="form-grid">
        {[
          ['company_name', 'Nama toko'], ['tagline', 'Tagline'], ['email', 'Email toko'],
          ['whatsapp_phone', 'Nomor WhatsApp'], ['address', 'Alamat'], ['opening_hours', 'Jam operasional'],
          ['instagram', 'Instagram URL'], ['tiktok', 'TikTok URL'], ['playlist', 'Playlist URL'],
          ['hero_video', 'URL video hero (HTTPS)'],
        ].map(([key, label]) => (
          <label key={key}>{label}
            <input
              type={key === 'email' ? 'email' : 'text'}
              maxLength={key === 'email' ? 254 : undefined}
              required={key === 'company_name'}
              value={form[key]}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        ))}
        <label className="span-2">Misi toko
          <textarea rows="3" maxLength="4000" value={form.mission} onChange={(event) => update('mission', event.target.value)} />
        </label>
        <label className="span-2">Cerita perusahaan
          <textarea rows="4" maxLength="4000" value={form.company_story} onChange={(event) => update('company_story', event.target.value)} />
        </label>
        <label className="span-2">Pilihan & perhatian
          <textarea rows="4" maxLength="4000" value={form.company_selection} onChange={(event) => update('company_selection', event.target.value)} />
        </label>
        <label className="span-2">Komitmen (satu per baris)
          <textarea rows="4" maxLength="4000" value={form.company_commitments} onChange={(event) => update('company_commitments', event.target.value)} />
        </label>
        <label>Ongkir dasar (IDR)
          <input type="number" min="0" step="1" value={form.shipping_fee} onChange={(event) => update('shipping_fee', event.target.value)} />
        </label>
        <label>Ambang gratis ongkir (IDR)
          <input type="number" min="0" step="1" value={form.free_shipping} onChange={(event) => update('free_shipping', event.target.value)} />
        </label>
        <label className="span-2">Rekening transfer (JSON)
          <textarea rows="4" value={form.manual_bank_accounts} onChange={(event) => update('manual_bank_accounts', event.target.value)} />
          <small>Contoh format: <code>{'[{"code":"bca","account":"NOMOR_REKENING","holder":"NAMA PEMILIK"}]'}</code>. Data rekening ini ditampilkan kepada pembeli saat checkout.</small>
        </label>
      </div>
      <button className="button button-dark" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan pengaturan'}</button>
    </form>
  );
}

export function AdminUsers({ users, currentUserId, onSave, onDelete, saving }) {
  const [newUser, setNewUser] = useState({ email: '', role: 'editor', password: '' });
  const [passwords, setPasswords] = useState({});
  return (
    <div className="migration-admin-section migration-admin-content">
      <form className="checkout-form migration-admin-product-form" onSubmit={async (event) => {
        event.preventDefault();
        if (await onSave(newUser)) setNewUser({ email: '', role: 'editor', password: '' });
      }}>
        <h2>Tambah akun staf</h2>
        <label>Email<input type="email" required value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} /></label>
        <label>Peran<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="editor">Editor</option><option value="admin">Admin</option></select></label>
        <label>Kata sandi awal (min. 14 karakter)<input type="password" minLength="14" required value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></label>
        <button className="button button-dark" disabled={saving}>Tambah staf</button>
      </form>
      <section className="migration-admin-list">
        <h2>Akun terdaftar</h2>
        {users.map((staff) => (
          <article key={staff.id}>
            <div><strong>{staff.email}</strong><span>{staff.role}{String(staff.id) === String(currentUserId) ? ' · akun aktif' : ''}</span></div>
            <div className="migration-admin-actions">
              <select aria-label={`Peran ${staff.email}`} value={staff.role} disabled={String(staff.id) === String(currentUserId)} onChange={(event) => onSave({ ...staff, role: event.target.value })}>
                <option value="editor">Editor</option><option value="admin">Admin</option>
              </select>
              <input type="password" aria-label={`Kata sandi baru ${staff.email}`} placeholder="Kata sandi baru (opsional)" minLength="14" maxLength="256" value={passwords[staff.id] || ''} onChange={(event) => setPasswords({ ...passwords, [staff.id]: event.target.value })} />
              <button className="button button-outline" type="button" disabled={saving || !passwords[staff.id]} onClick={async () => {
                if (await onSave({ ...staff, password: passwords[staff.id] })) setPasswords({ ...passwords, [staff.id]: '' });
              }}>Ubah sandi</button>
              <button className="text-button" type="button" disabled={saving || String(staff.id) === String(currentUserId)} onClick={() => onDelete(staff)}>Hapus</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export function AdminAnalytics({ data }) {
  if (!data) return <p className="migration-state">Memuat analitik…</p>;
  const list = (title, items, label, value, format = (item) => item[value]) => (
    <section className="migration-admin-list">
      <h2>{title}</h2>
      {!items.length && <p>Belum ada data.</p>}
      {items.map((item, index) => <article key={`${item[label]}-${index}`}><strong>{item[label]}</strong><b>{format(item)}</b></article>)}
    </section>
  );
  return (
    <div className="migration-admin-content migration-admin-section">
      {list('Produk paling banyak dilihat · 30 hari', data.product_views, 'title', 'views')}
      {list('Pencarian teratas · 30 hari', data.top_searches, 'term', 'searches')}
      {list('Produk terlaris · selesai', data.best_sellers, 'title', 'units')}
    </div>
  );
}

const activityLabels = {
  product_created: 'Produk ditambahkan',
  product_updated: 'Produk diperbarui',
  product_archived: 'Produk diarsipkan',
  product_duplicated: 'Produk diduplikasi',
  article_created: 'Artikel ditambahkan',
  article_updated: 'Artikel diperbarui',
  article_deleted: 'Artikel dihapus',
  staff_added: 'Akun staf ditambahkan',
  staff_updated: 'Akun staf diperbarui',
  staff_deleted: 'Akun staf dihapus',
  password_changed: 'Kata sandi staf diubah',
  order_status_changed: 'Pesanan diperbarui',
  review_moderated: 'Ulasan dimoderasi',
  payment_shipping_settings_updated: 'Pengaturan pembayaran/pengiriman diperbarui',
  store_settings_updated: 'Pengaturan toko diperbarui',
  backup_exported: 'Backup data diekspor',
};

export function AdminActivity({ activities }) {
  return (
    <section className="migration-admin-section migration-admin-list migration-admin-activity">
      <div className="migration-admin-toolbar">
        <div>
          <h2>Riwayat aktivitas admin</h2>
          <p>Aktivitas terbaru, maksimal 300 catatan.</p>
        </div>
      </div>
      {!activities.length && <p>Belum ada aktivitas admin yang tercatat.</p>}
      {activities.map((activity) => (
        <article key={activity.id}>
          <div className="migration-activity-heading">
            <strong>{activityLabels[activity.action] || activity.action}</strong>
            <span>{activity.actor}</span>
          </div>
          <time dateTime={activity.created_at}>
            {new Date(activity.created_at).toLocaleString('id-ID')}
          </time>
          {activity.details && <pre>{activity.details}</pre>}
        </article>
      ))}
    </section>
  );
}

export function AdminBackups({ onDownload, saving }) {
  return (
    <section className="migration-admin-section migration-admin-product-form">
      <h2>Backup data toko</h2>
      <p>Unduh salinan JSON tabel toko dan data pesanan. File berisi data pribadi pelanggan, jadi simpan terenkripsi dan jangan bagikan.</p>
      <button className="button button-dark" type="button" onClick={onDownload} disabled={saving}>
        {saving ? 'Menyiapkan backup…' : 'Unduh backup JSON'}
      </button>
      <div className="checkout-note">
        Pemulihan database produksi dilakukan melalui restore point/backup Neon, bukan mengunggah file ke fungsi Netlify.
        Setelah pemulihan staging, periksa data, stok, dan konfigurasi rekening sebelum mengaktifkan checkout.
      </div>
    </section>
  );
}
