import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AdminPage from './AdminPage.jsx';
import AdminPasswordReset from './AdminPasswordReset.jsx';
import CartPage from './CartPage.jsx';
import CheckoutPage from './CheckoutPage.jsx';
import OrderPage from './OrderPage.jsx';
import {
  ArticlePage,
  CompanyPage,
  CompanyProfilePage,
  InstallPage,
  PoliciesPage,
} from './PublicPages.jsx';
import './migration.css';
import '../../assets/style.css';
import '../../assets/brand.css';
import '../../assets/record-room.css';
import '../../assets/payment.css';
import '../../assets/company-profile.css';
import '../../assets/pwa.css';
import { readCart, saveCart } from './store.js';

function AppRouter() {
  const [route, setRoute] = React.useState(
    () => new URLSearchParams(window.location.search).get('page') || 'home',
  );
  const [cartState, setCartState] = React.useState(() => {
    try {
      return { cart: readCart(), error: '' };
    } catch (error) {
      return { cart: [], error: error.message };
    }
  });

  React.useEffect(() => {
    const updateRoute = () => setRoute(
      new URLSearchParams(window.location.search).get('page') || 'home',
    );
    const updateCart = () => {
      try {
        setCartState({ cart: readCart(), error: '' });
      } catch (error) {
        console.error('Saved RockMerch cart is invalid.', error);
        setCartState({ cart: [], error: error.message });
      }
    };
    window.addEventListener('popstate', updateRoute);
    window.addEventListener('rm-cart-updated', updateCart);
    window.addEventListener('storage', updateCart);
    return () => {
      window.removeEventListener('popstate', updateRoute);
      window.removeEventListener('rm-cart-updated', updateCart);
      window.removeEventListener('storage', updateCart);
    };
  }, []);

  const updateCart = (cart) => {
    try {
      saveCart(cart);
      setCartState({ cart, error: '' });
      return true;
    } catch (error) {
      console.error('Could not save RockMerch cart.', error);
      setCartState((current) => ({ ...current, error: 'Keranjang tidak dapat disimpan di browser ini.' }));
      return false;
    }
  };
  const params = new URLSearchParams(window.location.search);
  const addToCart = (product, formatName) => {
    const format = (Array.isArray(product.formats) ? product.formats : [])
      .find((item) => (item.format || item.name) === formatName);
    const stock = Number(format?.stock);
    if (!format || !Number.isInteger(stock) || stock < 1) {
      return { ok: false, message: 'Stok format ini belum tersedia.' };
    }
    const existing = cartState.cart.find((item) => (
      String(item.productId) === String(product.id) && item.format === formatName
    ));
    if ((existing?.quantity || 0) >= Math.min(stock, 10)) {
      return { ok: false, message: 'Jumlah keranjang sudah mencapai stok tersedia.' };
    }
    const cart = existing
      ? cartState.cart.map((item) => (
        String(item.productId) === String(product.id) && item.format === formatName
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
      : [...cartState.cart, { productId: String(product.id), format: formatName, quantity: 1 }];
    if (!updateCart(cart)) {
      return { ok: false, message: 'Keranjang tidak dapat disimpan di browser ini.' };
    }
    return { ok: true, message: `${product.title} (${formatName}) ditambahkan ke keranjang.` };
  };

  if (route === 'cart') {
    return <CartPage cart={cartState.cart} cartError={cartState.error} onCartChange={updateCart} />;
  }
  if (route === 'checkout') {
    return <CheckoutPage cart={cartState.cart} cartError={cartState.error} onCartChange={updateCart} />;
  }
  if (route === 'order') return <OrderPage />;
  if (route === 'admin') return <AdminPage />;
  if (route === 'admin-reset') return <AdminPasswordReset />;
  if (route === 'company') return <CompanyPage />;
  if (route === 'company-profile') return <CompanyProfilePage />;
  if (route === 'policies') return <PoliciesPage />;
  if (route === 'install') return <InstallPage />;
  if (route === 'article') {
    return <ArticlePage slug={new URLSearchParams(window.location.search).get('slug') || ''} />;
  }
  return (
    <App
      cart={cartState.cart}
      cartError={cartState.error}
      onAddToCart={addToCart}
      catalogOnly={route === 'catalog'}
      initialSearch={route === 'catalog' ? params.get('q') || '' : ''}
      initialFormat={route === 'catalog' ? params.get('format') || '' : ''}
    />
  );
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('rm-pwa-install-available', { detail: event }));
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((error) => {
    console.error('RockMerch service worker could not be registered.', error);
  });
}

createRoot(document.getElementById('root')).render(<AppRouter />);
