(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const applySystemTheme = event => {
    if (localStorage.getItem('rm-theme')) return;
    const theme = event.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    updateLogos(theme);
  };
  if (typeof systemTheme.addEventListener === 'function') {
    systemTheme.addEventListener('change', applySystemTheme);
  } else {
    systemTheme.addListener(applySystemTheme);
  }
  const installButtons = $$('[data-install-app]');
  let installPromptEvent = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPromptEvent = event;
    installButtons.forEach(button => { button.hidden = false; });
  });
  installButtons.forEach(button => button.addEventListener('click', async () => {
    if (!installPromptEvent) return;
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') installButtons.forEach(item => { item.hidden = true; });
      installPromptEvent = null;
    } catch (error) {
      console.error('Rock Merch installation prompt could not be completed.', error);
    }
  }));
  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    installButtons.forEach(button => { button.hidden = true; });
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('service-worker.js')
      .catch(error => console.error('Rock Merch offline support could not be enabled.', error));
  }
  const header = $('#site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 25);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
  const heroVideo = $('.hero-video');
  if (heroVideo && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    heroVideo.pause(); heroVideo.removeAttribute('autoplay'); heroVideo.hidden = true;
  }
  $$('.theme-toggle').forEach(button => button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; localStorage.setItem('rm-theme', next);
    updateLogos(next);
  }));
  updateLogos(document.documentElement.dataset.theme || 'light');
  const passwordChangeForm = $('[data-password-change]');
  if (passwordChangeForm) {
    const newPassword = $('[name="new_password"]', passwordChangeForm);
    const confirmPassword = $('[name="confirm_password"]', passwordChangeForm);
    const matchMessage = $('[data-password-match]', passwordChangeForm);
    const updatePasswordMatch = () => {
      const hasConfirmation = confirmPassword.value !== '';
      const matches = confirmPassword.value === newPassword.value;
      confirmPassword.setCustomValidity(hasConfirmation && !matches ? 'Konfirmasi kata sandi baru tidak cocok.' : '');
      matchMessage.textContent = !hasConfirmation ? '' : matches ? 'Konfirmasi kata sandi cocok.' : 'Konfirmasi kata sandi belum cocok.';
      matchMessage.classList.toggle('password-match-error', hasConfirmation && !matches);
      matchMessage.classList.toggle('password-match-success', hasConfirmation && matches);
    };
    newPassword.addEventListener('input', updatePasswordMatch);
    confirmPassword.addEventListener('input', updatePasswordMatch);
  }
  const menuButton = $('.menu-toggle');
  menuButton?.addEventListener('click', () => {
    const nav = $('.main-nav'); const isOpen = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });
  $$('.main-nav a').forEach(link => link.addEventListener('click', () => {
    $('.main-nav')?.classList.remove('open'); menuButton?.setAttribute('aria-expanded', 'false');
  }));
  const mainNav = $('.main-nav');
  if (mainNav && !mainNav.querySelector('a[href="policies.php"]')) {
    const policiesLink = document.createElement('a');
    policiesLink.href = 'policies.php';
    policiesLink.textContent = 'Info belanja';
    mainNav.append(policiesLink);
  }
  if (mainNav && !mainNav.querySelector('a[href="install.php"]')) {
    const installLink = document.createElement('a');
    installLink.href = 'install.php';
    installLink.textContent = 'Pasang App';
    mainNav.append(installLink);
  }
  const reveal = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    }), { threshold: .12 });
    reveal.forEach(item => observer.observe(item));
  } else reveal.forEach(item => item.classList.add('revealed'));
  const updateFormatArtwork = card => {
    const art = $('.product-art', card);
    const selected = $('.format-tabs button.selected', card) || $('.format-tabs button:not(:disabled)', card) || $('.format-tabs button', card);
    if (art && selected) art.dataset.format = selected.dataset.format || '';
  };
  $$('.product-card').forEach(updateFormatArtwork);
  const formatLabel = (format, stock) => `${format}${stock > 0 ? ` · ${stock}` : ' · habis'}`;
  $$('.product-card').forEach(card => {
    const quickView = $('.quick-view', card);
    const tabs = $('.format-tabs', card);
    if (!quickView || !tabs) return;
    const data = $(`#product-data-${CSS.escape(quickView.dataset.product)}`);
    const product = data ? JSON.parse(data.textContent) : null;
    if (product) {
      $$('.format-tabs button', card).forEach(button => {
        const format = product.formats.find(item => item.format === button.dataset.format);
        if (format) button.textContent = formatLabel(format.format, Number(format.stock));
      });
    }
    const summary = document.createElement('small');
    summary.className = 'format-stock-summary';
    tabs.after(summary);
    if (product) summary.textContent = `Stok per format: ${product.formats.map(item => formatLabel(item.format, Number(item.stock))).join(' · ')}`;
    const detailLink = document.createElement('a');
    detailLink.className = 'product-detail-link';
    detailLink.href = `product.php?id=${encodeURIComponent(quickView.dataset.product)}`;
    detailLink.textContent = 'Lihat detail album →';
    $('.product-title', card)?.after(detailLink);
  });
  const footerLinks = $('.footer-bottom');
  if (footerLinks && !$('.policy-footer-link', footerLinks)) {
    const policies = document.createElement('a');
    policies.className = 'policy-footer-link';
    policies.href = 'policies.php';
    policies.textContent = 'Pengiriman · Pembayaran · Retur · Privasi';
    footerLinks.append(policies);
  }
  if (footerLinks && !footerLinks.querySelector('a[href="install.php"]')) {
    const installLink = document.createElement('a');
    installLink.href = 'install.php';
    installLink.textContent = 'Pasang Rock Merch';
    footerLinks.append(installLink);
  }
  const printProfileButton = $('[data-print-profile]');
  printProfileButton?.addEventListener('click', () => window.print());
  const whatsapp = document.body.dataset.whatsapp;
  const footerMain = $('.footer-main');
  if (whatsapp && footerMain && !$('.footer-whatsapp', footerMain)) {
    const contact = document.createElement('a');
    contact.className = 'footer-whatsapp';
    contact.href = whatsapp;
    contact.target = '_blank';
    contact.rel = 'noopener noreferrer';
    contact.textContent = 'WhatsApp toko ↗';
    footerMain.append(contact);
  }
  $$('.format-tabs').forEach(tabs => tabs.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    $$('.format-tabs button', tabs).forEach(item => item.classList.toggle('selected', item === button));
    updateFormatArtwork(tabs.parentElement);
    const price = $('.price b', tabs.parentElement);
    if (price) price.textContent = 'Rp' + Number(button.dataset.price).toLocaleString('id-ID');
  }));

  const cart = $('.mini-cart');
  $$('.add-cart').forEach(button => button.addEventListener('click', async () => {
    const card = button.closest('.product-card');
    const selected = $('.format-tabs button.selected', card);
    try {
      const response = await fetch('cart.php', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action:'add', id: button.dataset.id, format: selected?.dataset.format || button.dataset.format || (button.closest('.merch-card') ? 'Merchandise' : 'Vinyl'), csrf: document.body.dataset.csrf || '' })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Produk belum bisa ditambahkan.');
      const counter = $('.cart-trigger i');
      if (counter) counter.textContent = result.count;
      $('.cart-message', cart).textContent = `${button.dataset.title} masuk ke keranjang. ${result.count} rilisan siap diputar!`;
      cart.classList.add('open'); window.setTimeout(() => cart.classList.remove('open'), 3500);
    } catch (error) {
      $('.cart-message', cart).textContent = error.message;
      cart.classList.add('open'); window.setTimeout(() => cart.classList.remove('open'), 3500);
    }
  }));
  $('.cart-close')?.addEventListener('click', () => cart.classList.remove('open'));
  $$('[data-cart-quantity]').forEach(select => select.addEventListener('change', async () => {
    const response = await fetch('cart.php', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({action:'quantity',key:select.dataset.key,quantity:select.value,csrf:document.body.dataset.csrf||''}) });
    const result = await response.json();
    if (!response.ok) { alert(result.error || 'Jumlah tidak dapat diperbarui.'); location.reload(); return; }
    location.reload();
  }));
  $$('[data-cart-remove]').forEach(button => button.addEventListener('click', async () => {
    const response = await fetch('cart.php', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({action:'remove',key:button.dataset.key,csrf:document.body.dataset.csrf||''}) });
    if (!response.ok) { alert('Produk tidak dapat dihapus dari keranjang.'); return; }
    location.reload();
  }));

  const editor = $('[data-editor]');
  if (editor) {
    const form = editor.closest('form');
    $$('.editor-toolbar button').forEach(button => button.addEventListener('click', () => {
      const command = button.dataset.command;
      let value = button.dataset.value || null;
      if (command === 'createLink' || command === 'insertImage') {
        value = prompt(command === 'createLink' ? 'Masukkan alamat tautan:' : 'Masukkan alamat gambar (URL):');
        if (!value) return;
        if (!/^https?:\/\//i.test(value)) { alert('Gunakan alamat https:// atau http:// yang valid.'); return; }
      }
      editor.focus(); document.execCommand(command, false, value);
    }));
    form.addEventListener('submit', () => { $('[data-editor-source]', form).value = editor.innerHTML; });
    $('[data-preview-article]')?.addEventListener('click', () => {
      const preview = window.open('', '_blank', 'width=850,height=760');
      if (!preview) return;
      preview.document.open();
      preview.document.write(`<!doctype html><meta charset="utf-8"><title>Pratinjau artikel</title><style>body{max-width:720px;margin:60px auto;padding:0 20px;font:17px/1.8 Georgia,serif;color:#292820}h1{font:700 48px/1.05 Arial,sans-serif;letter-spacing:-2px}small{font:12px Arial;color:#777}p.lede{font-size:22px;color:#777}</style><small>PRATINJAU LINER NOTES</small><h1>${escapeHtml($('[name="title"]',form).value||'Tanpa judul')}</h1><p class="lede">${escapeHtml($('[name="excerpt"]',form).value)}</p><article>${escapeHtml(editor.innerText).replace(/\n/g,'<br>')}</article>`);
      preview.document.close();
    });
  }

  $$('input[type="file"]').forEach(input => {
    input.addEventListener('change', () => {
      const wrapper = input.closest('label');
      if (!wrapper) return;
      let preview = $('.upload-preview', wrapper);
      if (!preview) { preview = document.createElement('div'); preview.className = 'upload-preview'; input.insertAdjacentElement('afterend', preview); }
      preview.replaceChildren();
      [...input.files].forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const image = document.createElement('img'); image.alt = `Pratinjau ${file.name}`;
        image.title = file.name;
        const reader = new FileReader(); reader.onload = () => { image.src = reader.result; };
        reader.readAsDataURL(file); preview.append(image);
      });
    });
  });
  $$('input[name="images[]"]').forEach(input => {
    let files = [];
    let dragIndex = -1;
    const render = () => {
      const wrapper = input.closest('label');
      let preview = $('.upload-order-preview', wrapper);
      if (!preview) { preview = document.createElement('div'); preview.className = 'upload-preview upload-order-preview'; input.insertAdjacentElement('afterend', preview); }
      preview.replaceChildren();
      files.forEach((file, index) => {
        const image = document.createElement('img'); image.alt = `Foto ${index + 1}: ${file.name}`; image.title = `${index + 1}. ${file.name}`; image.draggable = true; image.dataset.index = String(index);
        const reader = new FileReader(); reader.onload = () => { image.src = reader.result; }; reader.readAsDataURL(file);
        image.addEventListener('dragstart', () => { dragIndex = index; });
        image.addEventListener('dragover', event => event.preventDefault());
        image.addEventListener('drop', event => {
          event.preventDefault(); const target = Number(image.dataset.index);
          if (dragIndex < 0 || dragIndex === target) return;
          [files[dragIndex], files[target]] = [files[target], files[dragIndex]];
          const transfer = new DataTransfer(); files.forEach(item => transfer.items.add(item)); input.files = transfer.files;
          dragIndex = -1; render();
        });
        preview.append(image);
      });
    };
    input.addEventListener('change', () => { files = [...input.files]; render(); });
    const zone = input.closest('label');
    zone?.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drop-active'); });
    zone?.addEventListener('dragleave', () => zone.classList.remove('drop-active'));
    zone?.addEventListener('drop', event => {
      event.preventDefault(); zone.classList.remove('drop-active');
      files = [...event.dataTransfer.files].filter(file => file.type.startsWith('image/'));
      const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file)); input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  const dialog = $('.quick-dialog');
  $$('.quick-view').forEach(button => button.addEventListener('click', () => {
    const data = JSON.parse($(`#product-data-${button.dataset.product}`).textContent);
    const tracks = data.tracklist.split(/\r?\n/).filter(Boolean).map(line => `<li>${escapeHtml(line)}</li>`).join('');
    $('.dialog-content', dialog).innerHTML = `<img src="${escapeAttr(data.image)}" alt="Sampul ${escapeAttr(data.title)}"><div><span class="eyebrow">${escapeHtml(data.condition)} · ${data.formats.map(f=>escapeHtml(f.format)).join(' / ')}</span><h2>${escapeHtml(data.title)}</h2><p>${escapeHtml(data.artist)}</p><p>${escapeHtml(data.description)}</p><span class="dialog-price">${data.formats.map(f=>`${escapeHtml(f.format)} ${formatMoney(f.price)}`).join(' &nbsp; · &nbsp; ')}</span><h3>Tracklist</h3><ul>${tracks}</ul>${data.audio ? `<audio controls preload="none" src="${escapeAttr(data.audio)}"><a href="${escapeAttr(data.audio)}">Putar preview</a></audio><small>Preview audio 30 detik sesuai sumber audio.</small>` : '<small>Preview audio belum tersedia untuk rilisan ini.</small>'}<p><a class="button button-dark" href="product.php?id=${encodeURIComponent(button.dataset.product)}">Buka halaman detail album</a></p></div>`;
    const audio = $('audio', dialog);
    audio?.addEventListener('timeupdate', () => { if (audio.currentTime >= 30) { audio.pause(); audio.currentTime = 0; } });
    dialog.showModal();
  }));
  $('.dialog-close')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  const searchOverlay = $('.search-overlay');
  $('[data-search-open]')?.addEventListener('click', () => { searchOverlay.hidden = false; $('#site-search').focus(); });
  $('.close-search')?.addEventListener('click', () => { searchOverlay.hidden = true; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && searchOverlay && !searchOverlay.hidden) searchOverlay.hidden = true;
  });
  $('#site-search')?.addEventListener('input', event => {
    const term = event.target.value.toLowerCase().trim();
    const cards = $$('.product-card').filter(card => card.innerText.toLowerCase().includes(term)).slice(0, 8);
    $('.search-results').innerHTML = term ? cards.map(card => `<a href="#shop">${escapeHtml($('h3',card)?.textContent||'')} <small>· ${escapeHtml($('.product-title p',card)?.textContent||'')}</small></a>`).join('') || '<p>Tidak ada rilisan yang cocok. Coba kata lain?</p>' : '';
  });
  $('#site-search')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.currentTarget.value.trim()) location.href = `shop.php?q=${encodeURIComponent(event.currentTarget.value.trim())}`;
  });

  $$('.format-row').forEach(row => attachFormatSelect(row));
  $('.add-format')?.addEventListener('click', () => {
    const row = document.createElement('div'); row.className = 'format-row';
    row.innerHTML = '<select name="format_name[]"><option value="">Pilih format</option><option>Vinyl</option><option>Kaset</option><option>CD</option><option>Merchandise</option></select><input type="number" name="format_price[]" min="0" placeholder="Harga (Rp)"><input type="number" name="format_stock[]" min="0" placeholder="Stok">';
    $('.format-editor').append(row); attachFormatSelect(row);
  });
  function attachFormatSelect(row) {
    const select = $('select', row); if (!select || !row.querySelector('[name="format_price[]"]')) return;
    select.addEventListener('change', () => {
      if (select.value === 'Merchandise') {
        const toggle = $('[name="merchandise"]');
        if (toggle) toggle.checked = true;
      }
    });
  }
  $$('[data-confirm]').forEach(button => button.addEventListener('click', event => {
    if (!confirm(button.dataset.confirm)) event.preventDefault();
  }));
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function formatMoney(value) { return 'Rp' + Number(value).toLocaleString('id-ID'); }
  function updateLogos(theme) {
    $$('.brand-logo').forEach(image => {
      if (image.dataset.logoFixed !== 'dark') image.src = theme === 'dark' ? image.dataset.logoDark : image.dataset.logoLight;
    });
  }
  if ($$('.product-card').length) {
    const stockSyncStatus = document.createElement('small');
    stockSyncStatus.className = 'stock-sync-status';
    stockSyncStatus.setAttribute('aria-live', 'polite');
    stockSyncStatus.textContent = 'Stok disinkronkan otomatis.';
    $('.product-grid')?.before(stockSyncStatus);
    const syncStock = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('shop.php?ajax=stock', { cache:'no-store' });
        if (!response.ok) throw new Error('Stok tidak dapat diperbarui.');
        const stockByProduct = await response.json();
        stockSyncStatus.textContent = `Stok diperbarui ${new Date().toLocaleTimeString('id-ID')}`;
        $$('.product-card').forEach(card => {
          const id = $('.quick-view', card)?.dataset.product || card.dataset.productId;
          if (!id) return;
          const formats = stockByProduct[id];
          const tabs = $$('.format-tabs button', card);
          if (!formats) {
            tabs.forEach(button => { button.disabled = true; });
            const addButton = $('.add-cart', card);
            if (addButton) addButton.disabled = true;
            return;
          }
          let totalStock = 0;
          tabs.forEach(button => {
            const format = formats.find(item => item.format === button.dataset.format);
            const stock = Math.max(0, Number(format?.stock || 0));
            totalStock += stock;
            button.disabled = !format || stock < 1;
            button.textContent = formatLabel(button.dataset.format, stock);
            if (format) button.dataset.price = String(format.price);
          });
          if (!$('.format-tabs button.selected:not(:disabled)', card)) {
            const firstAvailable = $('.format-tabs button:not(:disabled)', card);
            tabs.forEach(button => button.classList.toggle('selected', button === firstAvailable));
            updateFormatArtwork(card);
          }
          const selected = $('.format-tabs button.selected', card);
          const price = $('.price b', card);
          if (price && selected) price.textContent = formatMoney(selected.dataset.price);
          const addButton = $('.add-cart', card);
          if (addButton) addButton.disabled = totalStock < 1;
          const artwork = $('.product-art', card);
          let soldBadge = artwork ? $('.badge-sold', artwork) : null;
          if (totalStock < 1 && !soldBadge && artwork) {
            soldBadge = document.createElement('span');
            soldBadge.className = 'badge badge-sold';
            soldBadge.textContent = 'Habis';
            artwork.append(soldBadge);
          } else if (totalStock > 0) soldBadge?.remove();
          const productData = $(`#product-data-${CSS.escape(id)}`);
          const details = productData ? JSON.parse(productData.textContent) : null;
          if (productData) {
            details.formats = formats;
            productData.textContent = JSON.stringify(details);
          }
          const condition = $('.product-condition', card);
          if (condition && card.dataset.productId) condition.textContent = `Total stok semua format: ${totalStock} unit · Kondisi: ${card.dataset.condition}`;
          else if (condition && details) condition.textContent = `${totalStock > 0 ? 'Stok tersedia' : 'Stok habis'} · ${details.condition}`;
          const summary = $('.format-stock-summary', card);
          if (summary) summary.textContent = `Stok per format: ${formats.map(item => formatLabel(item.format, Math.max(0, Number(item.stock || 0)))).join(' · ')}`;
          $$('.format-stock-list li', card).forEach((item, index) => {
            const format = formats[index];
            if (!format) return;
            const priceText = $('strong', item);
            const stockText = $('small', item);
            if (priceText) priceText.textContent = formatMoney(format.price);
            if (stockText) stockText.textContent = Number(format.stock) > 0 ? `Stok: ${Number(format.stock)} unit` : 'Stok habis';
          });
        });
      } catch (error) {
        stockSyncStatus.textContent = 'Stok belum berhasil disinkronkan. Periksa koneksi.';
      }
    };
    window.setInterval(syncStock, 15000);
    document.addEventListener('visibilitychange', syncStock);
  }
  const liveOrderStats = $('[data-live-latest]');
  if (liveOrderStats) {
    const startingOrderId = Number(liveOrderStats.dataset.liveLatest || 0);
    const notice = $('[data-live-notice]');
    const message = $('[data-live-message]');
    const syncStatus = $('[data-live-sync-status]');
    const syncOrders = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('manage.php?view=orders&ajax=live', { cache:'no-store', credentials:'same-origin' });
        if (!response.ok) throw new Error('Sinkronisasi pesanan gagal.');
        const data = await response.json();
        if (syncStatus) syncStatus.textContent = `Tersinkron ${new Date().toLocaleTimeString('id-ID')}`;
        const pending = $('[data-live-pending]');
        if (pending) pending.textContent = data.pending;
        Object.entries(data.inventory || {}).forEach(([format, stock]) => {
          const counter = $(`[data-live-stock="${CSS.escape(format)}"]`);
          if (counter) counter.textContent = stock;
        });
        if (Number(data.latest_id) > startingOrderId && notice) {
          const newOrderCount = (data.orders || []).filter(order => Number(order.id) > startingOrderId).length;
          message.textContent = `${newOrderCount || 1} pesanan baru masuk.`;
          notice.hidden = false;
        }
        (data.orders || []).forEach(order => {
          const row = $(`[data-live-order="${Number(order.id)}"]`);
          if (!row) return;
          const status = $('.live-order-status', row);
          const tracking = $('.live-order-tracking', row);
          if (status) status.textContent = order.status_label;
          if (tracking) tracking.textContent = order.tracking_number ? `${order.shipping_carrier} · ${order.tracking_number}` : '';
          const select = $('[name="status"]', row);
          if (select && document.activeElement !== select && [...select.options].some(option => option.value === order.status)) select.value = order.status;
        });
      } catch (error) {
        if (syncStatus) syncStatus.textContent = 'Sinkronisasi terganggu; periksa koneksi.';
        if (message && notice && !notice.hidden) message.textContent = 'Pesanan baru tersedia. Muat ulang untuk melihat detailnya.';
      }
    };
    window.setInterval(syncOrders, 10000);
    document.addEventListener('visibilitychange', syncOrders);
  }
  const orderPage = $('.order-page');
  const orderNumber = new URLSearchParams(location.search).get('number');
  if (orderPage && orderNumber) {
    const status = $('.cart-summary > p:first-child strong', orderPage);
    const shippingInfo = $('.payment-instructions', orderPage);
  const syncStatus = document.createElement('small');
  syncStatus.dataset.orderSync = '';
  syncStatus.textContent = 'Status diperbarui otomatis setiap 10 detik.';
  orderPage.prepend(syncStatus);
  let trackingLink = $('[data-order-tracking]', orderPage);
    let carrierLabel = $('[data-order-carrier]', orderPage);
    if (shippingInfo && !trackingLink) {
      carrierLabel = document.createElement('p');
      carrierLabel.dataset.orderCarrier = '';
      trackingLink = document.createElement('a');
      trackingLink.dataset.orderTracking = '';
      trackingLink.hidden = true;
      trackingLink.rel = 'noopener noreferrer';
      shippingInfo.append(carrierLabel, trackingLink);
    }
    const refreshOrder = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`order.php?poll=1&number=${encodeURIComponent(orderNumber)}`, { cache:'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        syncStatus.textContent = `Status diperbarui ${new Date(data.updated_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID')}`;
        if (status) status.textContent = data.status_label;
        if (carrierLabel) carrierLabel.textContent = data.shipping_carrier ? `Kurir: ${data.shipping_carrier}` : '';
        if (trackingLink) {
          trackingLink.textContent = data.tracking_number ? `Lacak paket · ${data.tracking_number}` : '';
          const url = new URL(data.tracking_url || '#', location.href);
          trackingLink.href = url.protocol === 'https:' ? url.href : '#';
          trackingLink.hidden = !data.tracking_number;
        }
      } catch (error) {
        syncStatus.textContent = 'Pembaruan status sementara tidak tersedia.';
      }
    };
    window.setInterval(refreshOrder, 10000);
    document.addEventListener('visibilitychange', refreshOrder);
  }
})();
