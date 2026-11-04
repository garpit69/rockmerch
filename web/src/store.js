export const cartStorageKey = 'rm-netlify-cart';

export const readCart = () => {
  const stored = localStorage.getItem(cartStorageKey);
  if (!stored) return [];

  const cart = JSON.parse(stored);
  if (!Array.isArray(cart) || cart.some((item) => (
    !item
    || !/^[1-9]\d{0,17}$/.test(String(item.productId))
    || typeof item.format !== 'string'
    || !item.format
    || !Number.isInteger(item.quantity)
    || item.quantity < 1
    || item.quantity > 10
  ))) {
    throw new Error('Data keranjang tersimpan tidak valid. Hapus keranjang lalu coba lagi.');
  }
  return cart;
};

export const saveCart = (cart) => {
  localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  window.dispatchEvent(new Event('rm-cart-updated'));
};

export const formatName = (format) => format?.format || format?.name || '';

export const money = (amount) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

export const getProductFormat = (product, name) =>
  (Array.isArray(product?.formats) ? product.formats : [])
    .find((format) => formatName(format) === name);
