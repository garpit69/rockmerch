import { neon } from '@neondatabase/serverless';
import {
  activityWriteFailureMessage,
  AdminActivityWriteError,
  recordAdminActivity,
} from '../../lib/admin-activity.mjs';
import { jsonResponse, originIsAllowed, requireStaff } from './admin-security.mjs';

const productFormats = new Set(['Vinyl', 'Kaset', 'CD', 'Merchandise']);
const productStatuses = new Set(['draft', 'published', 'archived']);
const fieldLimits = {
  title: 200,
  artist: 200,
  genre: 100,
  year: 20,
  label: 160,
  condition_name: 40,
  energy: 40,
  mood: 40,
  nostalgia: 40,
  keywords: 1000,
  badge: 80,
  description: 5000,
  tracklist: 5000,
  audio_url: 1000,
  status: 20,
};

const validImage = (image) => {
  if (typeof image !== 'string' || !image.trim() || image.length > 1000) return false;
  if (image.startsWith('/') && !image.startsWith('//')) return true;
  try {
    return new URL(image).protocol === 'https:';
  } catch {
    return false;
  }
};

const validateProduct = (product) => {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return { error: 'Data produk tidak valid.' };
  }
  for (const [field, limit] of Object.entries(fieldLimits)) {
    if (product[field] !== undefined && (
      typeof product[field] !== 'string' || product[field].trim().length > limit
    )) {
      return { error: `Kolom ${field} melebihi batas.` };
    }
  }
  if (!product.title?.trim() || !product.artist?.trim()) {
    return { error: 'Judul produk dan artis wajib diisi.' };
  }
  if (!productFormats.length || !Array.isArray(product.formats) || !product.formats.length || product.formats.length > 10) {
    return { error: 'Tambahkan 1–10 format produk.' };
  }
  const seenFormats = new Set();
  const formats = [];
  for (const item of product.formats) {
    const format = item?.format || item?.name;
    if (
      !productFormats.has(format)
      || seenFormats.has(format)
      || !Number.isSafeInteger(item.price)
      || item.price < 1
      || item.price > 1_000_000_000_000
      || !Number.isSafeInteger(item.stock)
      || item.stock < 0
      || item.stock > 1_000_000_000
    ) {
      return { error: 'Nama format, harga, atau stok produk tidak valid.' };
    }
    seenFormats.add(format);
    formats.push({ format, price: item.price, stock: item.stock });
  }
  const images = product.images === undefined ? [] : product.images;
  if (!Array.isArray(images) || images.length > 10 || images.some((image) => !validImage(image))) {
    return { error: 'Daftar gambar harus berupa maksimal 10 URL HTTPS atau path lokal.' };
  }
  if (product.audio_url && !validImage(product.audio_url)) {
    return { error: 'Pratinjau audio harus berupa URL HTTPS atau path lokal.' };
  }
  const status = product.status || 'draft';
  if (!productStatuses.has(status)) return { error: 'Status produk tidak valid.' };
  if (product.featured !== undefined && typeof product.featured !== 'boolean') {
    return { error: 'Status unggulan tidak valid.' };
  }
  if (product.merchandise !== undefined && typeof product.merchandise !== 'boolean') {
    return { error: 'Jenis produk tidak valid.' };
  }

  return {
    product: {
      title: product.title.trim(),
      artist: product.artist.trim(),
      formats,
      genre: product.genre?.trim() || '',
      year: product.year?.trim() || '',
      label: product.label?.trim() || '',
      condition_name: product.condition_name?.trim() || 'Mint',
      energy: product.energy?.trim() || 'Sedang',
      mood: product.mood?.trim() || 'Sedang',
      nostalgia: product.nostalgia?.trim() || 'Sedang',
      keywords: product.keywords?.trim() || '',
      badge: product.badge?.trim() || '',
      description: product.description?.trim() || '',
      tracklist: product.tracklist?.trim() || '',
      audio_url: product.audio_url?.trim() || '',
      images,
      status,
      featured: product.featured === true,
      merchandise: product.merchandise === true,
    },
  };
};

const readBody = async (request) => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return { error: 'Content-Type must be application/json.' };
  }
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? { body }
      : { error: 'Request body must be a JSON object.' };
  } catch {
    return { error: 'Request body must be valid JSON.' };
  }
};

export default async (request) => {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH' });
  }
  if (!process.env.DATABASE_URL) return jsonResponse({ error: 'Database is not configured.' }, 503);
  if (request.method !== 'GET' && !originIsAllowed(request)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403);
  }

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireStaff(request, sql);
  if (!auth.user) return auth.response;

  if (request.method === 'GET') {
    try {
      const products = await sql`
        SELECT id, title, artist, formats, genre, year, label, condition_name,
          energy, mood, nostalgia, keywords, badge, description, tracklist,
          audio_url, images, status, featured, merchandise, created_at
        FROM products
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `;
      return jsonResponse({ products });
    } catch (error) {
      console.error('Admin product list failed.', error);
      return jsonResponse({ error: 'Produk tidak dapat dimuat.' }, 500);
    }
  }

  const parsed = await readBody(request);
  if (parsed.error) return jsonResponse({ error: parsed.error }, 400);
  const { body } = parsed;
  const productId = body.id === undefined ? null : Number(body.id);
  if (request.method === 'PATCH' && (!Number.isSafeInteger(productId) || productId < 1)) {
    return jsonResponse({ error: 'ID produk tidak valid.' }, 400);
  }
  if (request.method === 'PATCH' && body.action === 'archive') {
    try {
      const [product] = await sql`
        UPDATE products
        SET status = 'archived'
        WHERE id = ${productId}
        RETURNING id, title, status
      `;
      if (product) {
        await recordAdminActivity(sql, auth.user.email, 'product_archived', JSON.stringify({
          product_id: product.id,
          title: product.title,
        }));
      }
      return product
        ? jsonResponse({ product })
        : jsonResponse({ error: 'Produk tidak ditemukan.' }, 404);
    } catch (error) {
      if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
      console.error('Admin product archive failed.', error);
      return jsonResponse({ error: 'Produk belum dapat diarsipkan.' }, 500);
    }
  }
  if (request.method === 'PATCH' && body.action === 'duplicate') {
    try {
      const [product] = await sql`
        INSERT INTO products (
          title, artist, formats, genre, year, label, condition_name,
          energy, mood, nostalgia, keywords, badge, description, tracklist,
          audio_url, images, status, featured, merchandise
        )
        SELECT title || ' (salinan)', artist, formats, genre, year, label,
          condition_name, energy, mood, nostalgia, keywords, badge, description,
          tracklist, audio_url, images, 'draft', FALSE, merchandise
        FROM products
        WHERE id = ${productId}
        RETURNING id, title, status
      `;
      if (product) {
        await recordAdminActivity(sql, auth.user.email, 'product_duplicated', JSON.stringify({
          product_id: product.id,
          title: product.title,
        }));
      }
      return product
        ? jsonResponse({ product }, 201)
        : jsonResponse({ error: 'Produk tidak ditemukan.' }, 404);
    } catch (error) {
      if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
      console.error('Admin product duplicate failed.', error);
      return jsonResponse({ error: 'Salinan produk belum dapat dibuat.' }, 500);
    }
  }
  const validation = validateProduct(body);
  if (validation.error) return jsonResponse({ error: validation.error }, 400);
  const product = validation.product;

  try {
    if (request.method === 'POST') {
      const [saved] = await sql`
        INSERT INTO products (
          title, artist, formats, genre, year, label, condition_name,
          energy, mood, nostalgia, keywords, badge, description, tracklist,
          audio_url, images, status, featured, merchandise
        )
        VALUES (
          ${product.title}, ${product.artist}, ${JSON.stringify(product.formats)}::jsonb,
          ${product.genre}, ${product.year}, ${product.label}, ${product.condition_name},
          ${product.energy}, ${product.mood}, ${product.nostalgia}, ${product.keywords},
          ${product.badge}, ${product.description}, ${product.tracklist}, ${product.audio_url},
          ${JSON.stringify(product.images)}::jsonb, ${product.status},
          ${product.featured}, ${product.merchandise}
        )
        RETURNING id, title, status
      `;
      await recordAdminActivity(sql, auth.user.email, 'product_created', JSON.stringify({
        product_id: saved.id,
        title: saved.title,
      }));
      return jsonResponse({ product: saved }, 201);
    }

    const formatsJson = JSON.stringify(product.formats);
    const [saved] = await sql`
      UPDATE products
      SET title = ${product.title}, artist = ${product.artist},
          formats = ${formatsJson}::jsonb,
          genre = ${product.genre}, year = ${product.year}, label = ${product.label},
          condition_name = ${product.condition_name}, energy = ${product.energy},
          mood = ${product.mood}, nostalgia = ${product.nostalgia},
          keywords = ${product.keywords}, badge = ${product.badge},
          description = ${product.description}, tracklist = ${product.tracklist},
          audio_url = ${product.audio_url}, images = ${JSON.stringify(product.images)}::jsonb,
          status = ${product.status}, featured = ${product.featured},
          merchandise = ${product.merchandise}
      WHERE id = ${productId}
        AND NOT EXISTS (
          SELECT 1
          FROM order_items AS oi
          JOIN orders AS o ON o.id = oi.order_id
          WHERE oi.product_id = products.id
            AND o.status NOT IN ('cancelled', 'shipped', 'completed')
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(${formatsJson}::jsonb) AS proposed(value)
              WHERE COALESCE(proposed.value->>'format', proposed.value->>'name') = oi.format
            )
        )
      RETURNING id, title, status
    `;
    if (saved) {
      await recordAdminActivity(sql, auth.user.email, 'product_updated', JSON.stringify({
        product_id: saved.id,
        title: saved.title,
      }));
      return jsonResponse({ product: saved });
    }

    const [existing] = await sql`SELECT id FROM products WHERE id = ${productId}`;
    return existing
      ? jsonResponse({ error: 'Format yang masih dipakai pesanan aktif tidak dapat dihapus.' }, 409)
      : jsonResponse({ error: 'Produk tidak ditemukan.' }, 404);
  } catch (error) {
    if (error instanceof AdminActivityWriteError) return jsonResponse({ error: activityWriteFailureMessage }, 500);
    console.error('Admin product save failed.', error);
    return jsonResponse({ error: 'Produk belum dapat disimpan.' }, 500);
  }
};

export const config = { path: '/api/admin/products' };
