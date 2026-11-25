/**
 * DANISH POS - KASIR TERMINAL ENGINE (V3.2 - FULL BACKEND SYNC EDITION)
 * Terintegrasi 100% dengan:
 * - Router.gs, AdminController.gs, PosController.gs, QrisGateway.gs
 * - SHA-256 Checksum Transaction Signing (Anti-Fraud Server Validation)
 * - Auto-Sync Logo Base64, Preferensi Struk, Pajak, Pembulatan & Poin Member
 * - Multi-Satuan (conversion_qty), Promo Engine, Shift Clerek & QRIS Hybrid
 */

// =========================================================================
// 1. STATE & KONFIGURASI GLOBAL
// =========================================================================
let SESSION = null;
let ACTIVE_SHIFT = null;
let PRODUCTS = [];
let PROMOTIONS = [];
let CUSTOMERS = [];
let CART = [];
let PARKED_CARTS = [];
let SELECTED_CUSTOMER = null;
let CURRENT_CATEGORY = 'SEMUA';
let SEARCH_QUERY = '';
let SELECTED_CART_INDEX = -1;

// Multi-Currency State
let CURRENCY_CONFIG = {
  activeCurrency: 'IDR',
  symbol: 'Rp',
  rateToIdr: 1,
  rates: {
    IDR: { symbol: 'Rp', rate: 1, name: 'Rupiah Indonesia' },
    USD: { symbol: '$', rate: 16200, name: 'US Dollar' },
    SGD: { symbol: 'S$', rate: 12050, name: 'Singapore Dollar' },
    MYR: { symbol: 'RM', rate: 3650, name: 'Malaysian Ringgit' },
    EUR: { symbol: '€', rate: 17500, name: 'Euro' },
    JPY: { symbol: '¥', rate: 108, name: 'Japanese Yen' }
  }
};

// Desain Kustomisasi dari Admin (Default Fallback)
let KASIR_DESIGN_CFG = {
  themePreset: 'blue',
  primaryColor: '#1a56db',
  topbarGrad1: '#2b579a',
  topbarGrad2: '#1e3f73',
  accentColor: '#059669',
  fontFamily: 'Inter',
  gridCols: '4',
  gridDensity: 'normal',
  cardRadius: '10',
  compLogo: true,
  compPromo: true,
  compSearch: true,
  compCategory: true,
  compQuickAction: true,
  compNumpad: true,
  compCustomer: true,
  compTaxToggle: true,
  compForex: true,
  compHoldRecall: true,
  compCustomAmount: true,
  compDrawer: true,
  compSyncBadge: true,
  showProductImg: true,
  showProductStock: true,
  showProductSku: true,
  promoText: 'PROMO SPESIAL HARI INI! Cek penawaran terbaik di kasir.',
  promoBg: '#fef3c7',
  promoColor: '#92400e',
  promoSpeed: 22
};

// Preferensi Perusahaan & Struk dari Admin
let KASIR_COMPANY_PREFS = {
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  receiptFooter: 'Terima Kasih Atas Kunjungan Anda',
  logoBase64: '',
  logoUrl: '',
  taxEnabled: false,
  taxPct: 11,
  taxInclusive: true,
  roundEnabled: true,
  roundMode: 'DOWN',
  roundStep: 100,
  pointEarnStep: 10000,
  pointRedeemVal: 100,
  prefixStruk: 'TRX-'
};

// Payment & Checkout State
let CHECKOUT_STATE = {
  globalDiscType: 'NOMINAL',
  globalDiscVal: 0,
  taxRate: 0.11,
  useTax: false,
  autoRound: true,
  redeemPoints: 0,
  payments: [],
  activePayMethod: 'CASH',
  qrisMode: 'OFFLINE_EMVCO',
  qrisStaticString: '',
  qrisDynamicPayload: ''
};

// =========================================================================
// 2. INISIALISASI HALAMAN & KEAMANAN SESI
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  checkSessionSecurity();
  loadShiftState();
  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);

  loadCurrencyState();
  await initKasirDesignConfig();
  await loadInitialPosData();

  bindGlobalShortcuts();
  bindModalEnterKeys();
  updateSyncStatusBadge();
  setInterval(syncOfflineTransactions, 30000);
});

function checkSessionSecurity() {
  const raw = localStorage.getItem('DANISH_POS_SESSION') || sessionStorage.getItem('DANISH_POS_SESSION');
  if (!raw) {
    window.location.href = 'index.html';
    return;
  }
  try {
    SESSION = JSON.parse(raw);
    if (!SESSION || !SESSION.user || !SESSION.store) {
      throw new Error('Sesi tidak valid');
    }
    const storeNameEl = document.getElementById('posStoreName');
    const cashierNameEl = document.getElementById('posCashierName');
    const cashierRoleEl = document.getElementById('posCashierRole');

    if (storeNameEl) storeNameEl.textContent = SESSION.store.namaToko || SESSION.store.kodeToko;
    if (cashierNameEl) cashierNameEl.textContent = SESSION.user.nama || SESSION.user.username;
    if (cashierRoleEl) cashierRoleEl.textContent = (SESSION.user.role || 'KASIR').toUpperCase();
  } catch (e) {
    localStorage.removeItem('DANISH_POS_SESSION');
    window.location.href = 'index.html';
  }
}

function getStoreCode() {
  return SESSION?.store?.kodeToko || SESSION?.storeCode || 'GLOBAL';
}

function loadShiftState() {
  try {
    const raw = localStorage.getItem('DANISH_ACTIVE_SHIFT_' + getStoreCode());
    if (raw) ACTIVE_SHIFT = JSON.parse(raw);
  } catch (e) {}
}

function updateClockDisplay() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const el = document.getElementById('posDateTime');
  if (el) el.textContent = `${dateStr} • ${timeStr}`;
}

function logoutKasir() {
  if (CART.length > 0) {
    if (!confirm('Masih ada item di keranjang aktif. Yakin ingin keluar dari kasir?')) return;
  }
  localStorage.removeItem('DANISH_POS_SESSION');
  sessionStorage.removeItem('DANISH_POS_SESSION');
  window.location.href = 'index.html';
}

// =========================================================================
// 3. SINKRONISASI DESAIN, LOGO & PREFERENSI PERUSAHAAN DARI ADMIN
// =========================================================================
async function initKasirDesignConfig() {
  const storeCode = getStoreCode();
  const designCacheKey = 'DANISH_DESIGN_CONFIG_' + storeCode;

  // 1. Muat Cache Lokal terlebih dahulu
  try {
    const cachedDesign = localStorage.getItem(designCacheKey);
    if (cachedDesign) KASIR_DESIGN_CFG = { ...KASIR_DESIGN_CFG, ...JSON.parse(cachedDesign) };

    const cachedPrefs =
      localStorage.getItem('DANISH_POS_COMPANY_PREFS') ||
      localStorage.getItem('DANISH_COMPANY_PREFS_' + storeCode);
    if (cachedPrefs) KASIR_COMPANY_PREFS = { ...KASIR_COMPANY_PREFS, ...JSON.parse(cachedPrefs) };

    applyCompanyPrefsDefaults();
    await applyKasirDesignToDOM();
  } catch (e) {}

  // 2. Tarik Data Terbaru dari Cloud (admin/get-design & admin/get-preferences)
  try {
    const [cloudCfg, cloudPrefs] = await Promise.all([
      ApiClient.call('admin/get-design', { kodeToko: storeCode }).catch(() => null),
      ApiClient.call('admin/get-preferences', { kodeToko: storeCode }).catch(() => null)
    ]);

    if (cloudCfg && typeof cloudCfg === 'object' && Object.keys(cloudCfg).length > 0) {
      KASIR_DESIGN_CFG = { ...KASIR_DESIGN_CFG, ...cloudCfg };
      localStorage.setItem(designCacheKey, JSON.stringify(KASIR_DESIGN_CFG));
    }

    if (cloudPrefs && typeof cloudPrefs === 'object' && Object.keys(cloudPrefs).length > 0) {
      KASIR_COMPANY_PREFS = { ...KASIR_COMPANY_PREFS, ...cloudPrefs };
      localStorage.setItem('DANISH_POS_COMPANY_PREFS', JSON.stringify(KASIR_COMPANY_PREFS));
    }

    applyCompanyPrefsDefaults();
    await applyKasirDesignToDOM();
  } catch (e) {
    applyCompanyPrefsDefaults();
    await applyKasirDesignToDOM();
  }
}

function applyCompanyPrefsDefaults() {
  const prefs = KASIR_COMPANY_PREFS;
  const storeNameEl = document.getElementById('posStoreName');
  if (storeNameEl && prefs.companyName) {
    storeNameEl.textContent = prefs.companyName;
  }

  if (typeof prefs.taxPct === 'number' && !isNaN(prefs.taxPct)) {
    CHECKOUT_STATE.taxRate = prefs.taxPct / 100;
  }
  if (typeof prefs.taxEnabled === 'boolean') {
    CHECKOUT_STATE.useTax = prefs.taxEnabled;
    const taxToggleEl = document.getElementById('toggleTaxInput');
    if (taxToggleEl) taxToggleEl.checked = prefs.taxEnabled;
  }
  if (typeof prefs.roundEnabled === 'boolean') {
    CHECKOUT_STATE.autoRound = prefs.roundEnabled;
  }
}

async function applyKasirDesignToDOM() {
  const cfg = KASIR_DESIGN_CFG;
  const prefs = KASIR_COMPANY_PREFS;
  const root = document.documentElement;

  root.style.setProperty('--primary', cfg.primaryColor || '#1a56db');
  root.style.setProperty('--topbar-grad-1', cfg.topbarGrad1 || '#2b579a');
  root.style.setProperty('--topbar-grad-2', cfg.topbarGrad2 || '#1e3f73');
  root.style.setProperty('--accent', cfg.accentColor || '#059669');
  root.style.setProperty('--card-radius', (cfg.cardRadius || '10') + 'px');

  if (cfg.fontFamily) {
    document.body.style.fontFamily = `'${cfg.fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`;
  }

  // Logo Box (Render dari logoBase64 / logoUrl Admin)
  const logoBox = document.getElementById('reneLogoBox');
  if (logoBox) {
    logoBox.style.display = cfg.compLogo !== false ? 'flex' : 'none';
    const logoSrc = prefs.logoBase64 || prefs.logoUrl || '';
    if (logoSrc) {
      logoBox.innerHTML = `<img src="${logoSrc}" alt="LOGO" style="max-width:100%; max-height:76px; object-fit:contain;">`;
    } else {
      logoBox.textContent = 'LOGO';
    }
  }

  // Promo Ticker
  const promoWrap = document.getElementById('posPromoTickerWrap');
  const promoTextEl = document.getElementById('posPromoTickerText');
  if (promoWrap && promoTextEl) {
    promoWrap.style.display = cfg.compPromo !== false ? 'flex' : 'none';
    promoWrap.style.background = cfg.promoBg || '#fef3c7';
    promoWrap.style.color = cfg.promoColor || '#92400e';
    promoTextEl.textContent = cfg.promoText || 'PROMO SPESIAL HARI INI!';
    const speed = parseInt(cfg.promoSpeed, 10) || 22;
    promoTextEl.style.animationDuration = `${speed}s`;
  }

  toggleElementDisplay('posSearchWrap', cfg.compSearch !== false);
  toggleElementDisplay('posCategoryBar', cfg.compCategory !== false);
  toggleElementDisplay('posQuickActionBar', cfg.compQuickAction !== false);
  toggleElementDisplay('posNumpadSection', cfg.compNumpad !== false);
  toggleElementDisplay('posCustomerBox', cfg.compCustomer !== false);
  toggleElementDisplay('posTaxToggleWrap', cfg.compTaxToggle !== false);
  toggleElementDisplay('posForexBadgeWrap', cfg.compForex !== false);
  toggleElementDisplay('btnHoldOrder', cfg.compHoldRecall !== false);
  toggleElementDisplay('btnRecallOrder', cfg.compHoldRecall !== false);
  toggleElementDisplay('btnCustomAmount', cfg.compCustomAmount !== false);
  toggleElementDisplay('btnOpenDrawer', cfg.compDrawer !== false);
  toggleElementDisplay('posSyncBadge', cfg.compSyncBadge !== false);

  const grid = document.getElementById('posProductGrid');
  if (grid) {
    const cols = parseInt(cfg.gridCols, 10) || 4;
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.classList.remove('density-compact', 'density-normal', 'density-spacious');
    grid.classList.add('density-' + (cfg.gridDensity || 'normal'));
  }

  if (PRODUCTS.length > 0) renderProductGrid();
}

function toggleElementDisplay(id, show) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = show ? '' : 'none';
}

// =========================================================================
// 4. SINKRONISASI MASTER DATA POS (pos/sync-master & admin/get-qris)
// =========================================================================
function normalizeBackendProduct(raw) {
  return {
    id: `${raw.sku_code || raw.sku || ''}_${raw.barcode || ''}_${raw.unit || 'PCS'}`,
    sku: raw.sku_code || raw.sku || '',
    barcode: raw.barcode || raw.sku_code || '',
    nama: raw.name || raw.nama || 'Produk',
    kategori: raw.category || raw.kategori || 'Umum',
    satuan: raw.unit || raw.satuan || 'PCS',
    conversionQty: Number(raw.conversion_qty) || 1,
    hargaJual: Number(raw.price ?? raw.hargaJual ?? 0),
    stok: Number(raw.stock ?? raw.stok ?? 0),
    baseStock: Number(raw.base_stock ?? raw.stock ?? 0),
    trackStock: raw.trackStock !== false,
    aktif: raw.is_active !== false,
    gambar: raw.imageUrl || raw.gambar || ''
  };
}

function normalizeBackendMember(raw) {
  return {
    id: raw.member_id || raw.id || raw.card_code,
    kode: raw.card_code || raw.member_id || '',
    nama: raw.name || raw.nama || 'Member',
    hp: raw.phone || raw.hp || '',
    priceLevel: raw.price_level || 'Reguler',
    discountPct: Number(raw.member_discount_pct) || 0,
    poin: Number(raw.points ?? raw.poin ?? 0),
    creditLimit: Number(raw.credit_limit) || 0,
    currentDebt: Number(raw.current_debt) || 0
  };
}

async function loadInitialPosData() {
  const storeCode = getStoreCode();
  showToast('Sinkronisasi master data POS...', 'info');

  // 1. Load Cache Lokal terlebih dahulu
  try {
    const cachedProducts = localStorage.getItem('DANISH_PRODUCTS_' + storeCode);
    const cachedCustomers = localStorage.getItem('DANISH_CUSTOMERS_' + storeCode);
    const cachedPromos = localStorage.getItem('DANISH_PROMOS_' + storeCode);
    const cachedQris = localStorage.getItem('DANISH_STATIC_QRIS_' + storeCode);

    if (cachedProducts) {
      PRODUCTS = JSON.parse(cachedProducts);
      renderCategoryPills();
      renderProductGrid();
    }
    if (cachedCustomers) CUSTOMERS = JSON.parse(cachedCustomers);
    if (cachedPromos) PROMOTIONS = JSON.parse(cachedPromos);
    if (cachedQris) CHECKOUT_STATE.qrisStaticString = cachedQris;
  } catch (e) {}

  // 2. Tarik Data Terbaru dari Backend (pos/sync-master & admin/get-qris)
  try {
    const [masterRes, qrisRes] = await Promise.all([
      ApiClient.call('pos/sync-master', { kodeToko: storeCode }).catch(() => null),
      ApiClient.call('admin/get-qris', { kodeToko: storeCode }).catch(() => null)
    ]);

    if (masterRes && Array.isArray(masterRes.products)) {
      PRODUCTS = masterRes.products.map(normalizeBackendProduct);
      localStorage.setItem('DANISH_PRODUCTS_' + storeCode, JSON.stringify(PRODUCTS));
      renderCategoryPills();
      renderProductGrid();
    }

    if (masterRes && Array.isArray(masterRes.members)) {
      CUSTOMERS = masterRes.members.map(normalizeBackendMember);
      localStorage.setItem('DANISH_CUSTOMERS_' + storeCode, JSON.stringify(CUSTOMERS));
    }

    if (masterRes && Array.isArray(masterRes.promotions)) {
      PROMOTIONS = masterRes.promotions;
      localStorage.setItem('DANISH_PROMOS_' + storeCode, JSON.stringify(PROMOTIONS));
    }

    if (qrisRes) {
      CHECKOUT_STATE.qrisMode = qrisRes.mode || 'OFFLINE_EMVCO';
      if (qrisRes.staticPayload) {
        CHECKOUT_STATE.qrisStaticString = qrisRes.staticPayload;
        localStorage.setItem('DANISH_STATIC_QRIS_' + storeCode, qrisRes.staticPayload);
      }
    }

    showToast(`POS Siap (${PRODUCTS.length} item tersinkron)`, 'success');
  } catch (err) {
    console.warn('Mode Offline aktif:', err);
    showToast('Menggunakan database cache lokal (Offline)', 'warning');
  }

  // Restore Parked Carts
  try {
    const savedParked = localStorage.getItem('DANISH_PARKED_CARTS_' + storeCode);
    if (savedParked) PARKED_CARTS = JSON.parse(savedParked);
    updateParkedBadge();
  } catch (e) {}

  renderCart();
}

// =========================================================================
// 5. DUAL CURRENCY / MULTI-MATA UANG ENGINE
// =========================================================================
function loadCurrencyState() {
  try {
    const saved = localStorage.getItem('DANISH_POS_CURRENCY');
    if (saved) CURRENCY_CONFIG = { ...CURRENCY_CONFIG, ...JSON.parse(saved) };
  } catch (e) {}
  updateCurrencyBadgeUI();
}

function saveCurrencyState() {
  try {
    localStorage.setItem('DANISH_POS_CURRENCY', JSON.stringify(CURRENCY_CONFIG));
  } catch (e) {}
  updateCurrencyBadgeUI();
}

function updateCurrencyBadgeUI() {
  const codeEl = document.getElementById('activeCurrencyCode');
  const rateEl = document.getElementById('activeCurrencyRate');
  if (codeEl) codeEl.textContent = CURRENCY_CONFIG.activeCurrency;
  if (rateEl) {
    rateEl.textContent =
      CURRENCY_CONFIG.activeCurrency === 'IDR'
        ? '1 IDR'
        : `1 ${CURRENCY_CONFIG.activeCurrency} = Rp ${formatNumber(CURRENCY_CONFIG.rateToIdr)}`;
  }
}

function openCurrencyModal() {
  const modal = document.getElementById('modalCurrency');
  if (!modal) return;
  const select = document.getElementById('currencySelect');
  const rateInput = document.getElementById('currencyRateInput');
  if (select) select.value = CURRENCY_CONFIG.activeCurrency;
  if (rateInput) rateInput.value = CURRENCY_CONFIG.rateToIdr;
  modal.classList.add('active');
}

function onCurrencySelectChange() {
  const select = document.getElementById('currencySelect');
  const rateInput = document.getElementById('currencyRateInput');
  if (!select || !rateInput) return;
  const code = select.value;
  const info = CURRENCY_CONFIG.rates[code] || { rate: 1 };
  rateInput.value = info.rate;
  rateInput.disabled = code === 'IDR';
}

function applyCurrencySetting() {
  const select = document.getElementById('currencySelect');
  const rateInput = document.getElementById('currencyRateInput');
  if (!select || !rateInput) return;

  const code = select.value;
  let rate = parseFloat(rateInput.value) || 1;
  if (code === 'IDR') rate = 1;

  const info = CURRENCY_CONFIG.rates[code] || { symbol: code, rate };
  CURRENCY_CONFIG.activeCurrency = code;
  CURRENCY_CONFIG.symbol = info.symbol;
  CURRENCY_CONFIG.rateToIdr = rate;
  if (CURRENCY_CONFIG.rates[code]) CURRENCY_CONFIG.rates[code].rate = rate;

  saveCurrencyState();
  closeModal('modalCurrency');
  renderProductGrid();
  renderCart();
  showToast(`Mata uang aktif: ${code} (Kurs: Rp ${formatNumber(rate)})`, 'success');
}

function formatMoney(amountIdr, forceIdr = false) {
  const val = Number(amountIdr) || 0;
  if (forceIdr || CURRENCY_CONFIG.activeCurrency === 'IDR') {
    return 'Rp ' + formatNumber(Math.round(val));
  }
  const converted = val / (CURRENCY_CONFIG.rateToIdr || 1);
  return `${CURRENCY_CONFIG.symbol} ${converted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatNumber(num) {
  return Math.round(Number(num) || 0).toLocaleString('id-ID');
}

// =========================================================================
// 6. KATALOG PRODUK, PENCARIAN & BARCODE SCANNER
// =========================================================================
function renderCategoryPills() {
  const container = document.getElementById('posCategoryBar');
  if (!container) return;

  const cats = new Set(['SEMUA']);
  PRODUCTS.forEach((p) => {
    if (p.kategori && String(p.kategori).trim() !== '') {
      cats.add(String(p.kategori).trim().toUpperCase());
    }
  });

  let html = '';
  cats.forEach((cat) => {
    const isActive = CURRENT_CATEGORY === cat;
    html += `<button class="cat-pill ${isActive ? 'active' : ''}" onclick="selectCategory('${escapeHtml(cat)}')">${escapeHtml(cat)}</button>`;
  });
  container.innerHTML = html;
}

function selectCategory(cat) {
  CURRENT_CATEGORY = cat;
  renderCategoryPills();
  renderProductGrid();
}

function handleSearchInput(val) {
  SEARCH_QUERY = String(val || '').trim().toLowerCase();
  renderProductGrid();
}

function handleSearchEnter(e) {
  if (e.key !== 'Enter') return;
  const q = SEARCH_QUERY;
  if (!q) return;

  const exact = PRODUCTS.find(
    (p) =>
      String(p.barcode || '').toLowerCase() === q ||
      String(p.sku || '').toLowerCase() === q
  );

  if (exact) {
    addToCart(exact);
    const input = document.getElementById('posSearchInput');
    if (input) {
      input.value = '';
      SEARCH_QUERY = '';
      renderProductGrid();
    }
    playBeepSound();
  }
}

function renderProductGrid() {
  const grid = document.getElementById('posProductGrid');
  if (!grid) return;

  const cfg = KASIR_DESIGN_CFG;
  const filtered = PRODUCTS.filter((p) => {
    if (p.aktif === false) return false;
    const catMatch =
      CURRENT_CATEGORY === 'SEMUA' ||
      String(p.kategori || '').trim().toUpperCase() === CURRENT_CATEGORY;
    if (!catMatch) return false;

    if (!SEARCH_QUERY) return true;
    const hay = `${p.nama || ''} ${p.sku || ''} ${p.barcode || ''} ${p.kategori || ''} ${p.satuan || ''}`.toLowerCase();
    return hay.includes(SEARCH_QUERY);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 48px 16px; color:#64748b;">
        <div style="font-size:36px; margin-bottom:8px;">📦</div>
        <div style="font-weight:600; font-size:15px;">Produk tidak ditemukan</div>
        <div style="font-size:13px; margin-top:4px;">Coba kata kunci lain atau pilih kategori SEMUA.</div>
      </div>`;
    return;
  }

  let html = '';
  filtered.forEach((p) => {
    const stok = Number(p.stok ?? 0);
    const isOut = p.trackStock !== false && stok <= 0;
    const price = Number(p.hargaJual || 0);
    const imgUrl = p.gambar || '';
    const unitBadge = p.satuan && p.satuan !== 'PCS' ? ` (${p.satuan})` : '';

    html += `
      <div class="product-card ${isOut ? 'out-of-stock' : ''}" onclick="${isOut ? `showToast('Stok produk habis!', 'error')` : `addToCartById('${escapeHtml(String(p.id))}')`}">
        ${
          cfg.showProductImg !== false
            ? `<div class="product-img-wrap">
                ${
                  imgUrl
                    ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.nama)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div class="product-img-placeholder" style="display:none;">🛍️</div>`
                    : `<div class="product-img-placeholder">🛍️</div>`
                }
                ${
                  cfg.showProductStock !== false && p.trackStock !== false
                    ? `<span class="stock-badge ${stok <= 5 ? 'low' : ''}">Stok: ${stok}</span>`
                    : ''
                }
              </div>`
            : ''
        }
        <div class="product-info">
          ${cfg.showProductSku !== false ? `<div class="product-sku">${escapeHtml(p.sku)}${escapeHtml(unitBadge)}</div>` : ''}
          <div class="product-name" title="${escapeHtml(p.nama)}">${escapeHtml(p.nama)}</div>
          <div class="product-price">${formatMoney(price)}</div>
        </div>
      </div>`;
  });

  grid.innerHTML = html;
}

// =========================================================================
// 7. KERANJANG BELANJA (CART), PROMO OTOMATIS & NUMPAD ENGINE
// =========================================================================
function addToCartById(id) {
  const prod = PRODUCTS.find((p) => String(p.id) === String(id));
  if (prod) addToCart(prod);
}

function addToCart(prod, customQty = 1) {
  const maxStock = prod.trackStock !== false ? Number(prod.stok ?? 999999) : 999999;
  const unitPrice = Number(prod.hargaJual || 0);

  const existingIdx = CART.findIndex((item) => String(item.id) === String(prod.id) && !item.isCustom);
  if (existingIdx > -1) {
    const nextQty = CART[existingIdx].qty + customQty;
    if (nextQty > maxStock) {
      showToast(`Stok tidak mencukupi (Maks: ${maxStock})`, 'warning');
      return;
    }
    CART[existingIdx].qty = nextQty;
    SELECTED_CART_INDEX = existingIdx;
  } else {
    if (customQty > maxStock) {
      showToast(`Stok tidak mencukupi (Maks: ${maxStock})`, 'warning');
      return;
    }
    CART.push({
      id: prod.id,
      sku: prod.sku,
      barcode: prod.barcode || prod.sku,
      nama: prod.nama,
      satuan: prod.satuan || 'PCS',
      conversionQty: Number(prod.conversionQty) || 1,
      harga: unitPrice,
      qty: customQty,
      discNominal: 0,
      trackStock: prod.trackStock !== false,
      maxStock: maxStock,
      isCustom: false
    });
    SELECTED_CART_INDEX = CART.length - 1;
  }

  applyAutomaticPromotions();
  renderCart();
  syncCustomerDisplay();
}

function applyAutomaticPromotions() {
  if (!Array.isArray(PROMOTIONS) || PROMOTIONS.length === 0) return;
  const today = new Date().toISOString().slice(0, 10);

  CART.forEach((item) => {
    if (item.isCustom || item.manualDisc) return;
    const promo = PROMOTIONS.find(
      (pr) =>
        String(pr.target_barcode) === String(item.barcode) &&
        item.qty >= (Number(pr.min_qty) || 1) &&
        (!pr.start_date || today >= pr.start_date) &&
        (!pr.end_date || today <= pr.end_date)
    );

    if (promo) {
      if (promo.promo_type === 'DISCOUNT') {
        item.discNominal = Math.round((item.harga * item.qty * Number(promo.promo_price)) / 100);
      } else if (promo.promo_type === 'TIERED') {
        const diff = Math.max(0, item.harga - Number(promo.promo_price));
        item.discNominal = diff * item.qty;
      }
    }
  });
}

function openCustomAmountModal() {
  const modal = document.getElementById('modalCustomAmount');
  if (!modal) return;
  document.getElementById('customItemName').value = 'Item Manual / Jasa';
  document.getElementById('customItemPrice').value = '';
  document.getElementById('customItemQty').value = '1';
  modal.classList.add('active');
  setTimeout(() => document.getElementById('customItemPrice')?.focus(), 100);
}

function addCustomAmountItem() {
  const name = document.getElementById('customItemName').value.trim() || 'Item Manual';
  const rawPrice = parseFloat(document.getElementById('customItemPrice').value) || 0;
  const qty = parseInt(document.getElementById('customItemQty').value, 10) || 1;

  if (rawPrice <= 0) {
    showToast('Masukkan nominal harga yang valid', 'error');
    return;
  }

  const priceIdr =
    CURRENCY_CONFIG.activeCurrency === 'IDR'
      ? rawPrice
      : Math.round(rawPrice * CURRENCY_CONFIG.rateToIdr);

  CART.push({
    id: 'CUSTOM-' + Date.now(),
    sku: 'MANUAL',
    barcode: 'MANUAL',
    nama: name,
    satuan: 'PCS',
    conversionQty: 1,
    harga: priceIdr,
    qty: qty,
    discNominal: 0,
    trackStock: false,
    maxStock: 999999,
    isCustom: true
  });

  SELECTED_CART_INDEX = CART.length - 1;
  closeModal('modalCustomAmount');
  renderCart();
  syncCustomerDisplay();
}

function selectCartRow(index) {
  SELECTED_CART_INDEX = index;
  renderCart();
}

function changeCartQty(index, delta) {
  if (!CART[index]) return;
  const next = CART[index].qty + delta;
  if (next <= 0) {
    removeCartItem(index);
    return;
  }
  if (CART[index].trackStock && next > CART[index].maxStock) {
    showToast(`Batas stok maksimal tercapai (${CART[index].maxStock})`, 'warning');
    return;
  }
  CART[index].qty = next;
  SELECTED_CART_INDEX = index;
  applyAutomaticPromotions();
  renderCart();
  syncCustomerDisplay();
}

function removeCartItem(index) {
  CART.splice(index, 1);
  if (SELECTED_CART_INDEX >= CART.length) SELECTED_CART_INDEX = CART.length - 1;
  renderCart();
  syncCustomerDisplay();
}

function clearCart() {
  if (CART.length === 0) return;
  if (!confirm('Kosongkan seluruh item di keranjang saat ini?')) return;
  CART = [];
  SELECTED_CART_INDEX = -1;
  CHECKOUT_STATE.globalDiscVal = 0;
  CHECKOUT_STATE.redeemPoints = 0;
  SELECTED_CUSTOMER = null;
  updateCustomerBoxUI();
  renderCart();
  syncCustomerDisplay();
}

// Numpad Cepat
let NUMPAD_BUFFER = '';
let NUMPAD_MODE = 'QTY';

function setNumpadMode(mode) {
  NUMPAD_MODE = mode;
  NUMPAD_BUFFER = '';
  document.querySelectorAll('.numpad-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  showToast(`Mode Numpad: ${mode === 'QTY' ? 'Ubah Jumlah' : mode === 'DISC' ? 'Diskon Item (Rp)' : 'Ubah Harga Satuan'}`, 'info');
}

function pressNumpad(key) {
  if (SELECTED_CART_INDEX < 0 || !CART[SELECTED_CART_INDEX]) {
    showToast('Pilih item di keranjang terlebih dahulu', 'warning');
    return;
  }

  if (key === 'C') NUMPAD_BUFFER = '';
  else if (key === 'BACK') NUMPAD_BUFFER = NUMPAD_BUFFER.slice(0, -1);
  else NUMPAD_BUFFER += String(key);

  const val = parseInt(NUMPAD_BUFFER, 10) || 0;
  const item = CART[SELECTED_CART_INDEX];

  if (NUMPAD_MODE === 'QTY') {
    if (val <= 0) return;
    if (item.trackStock && val > item.maxStock) {
      showToast(`Stok maksimal ${item.maxStock}`, 'warning');
      NUMPAD_BUFFER = String(item.maxStock);
      item.qty = item.maxStock;
    } else {
      item.qty = val;
    }
    applyAutomaticPromotions();
  } else if (NUMPAD_MODE === 'DISC') {
    const maxDisc = item.harga * item.qty;
    item.discNominal = Math.min(val, maxDisc);
    item.manualDisc = true;
  } else if (NUMPAD_MODE === 'PRICE') {
    item.harga = val;
  }

  renderCart();
  syncCustomerDisplay();
}

function renderCart() {
  const tbody = document.getElementById('posCartBody');
  const emptyState = document.getElementById('posCartEmpty');
  const countBadge = document.getElementById('posCartItemCount');

  if (!tbody) return;

  const totalItems = CART.reduce((acc, it) => acc + it.qty, 0);
  if (countBadge) countBadge.textContent = `${totalItems} Item`;

  if (CART.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    updateCartSummaryUI();
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  let html = '';
  CART.forEach((item, idx) => {
    const lineSub = item.harga * item.qty - (item.discNominal || 0);
    const isSelected = idx === SELECTED_CART_INDEX;
    html += `
      <tr class="cart-row ${isSelected ? 'selected' : ''}" onclick="selectCartRow(${idx})">
        <td>
          <div class="cart-item-title">${escapeHtml(item.nama)}</div>
          <div class="cart-item-meta">
            ${formatMoney(item.harga)} / ${escapeHtml(item.satuan)}
            ${item.discNominal > 0 ? `<span class="cart-disc-tag">-Diskon ${formatMoney(item.discNominal)}</span>` : ''}
          </div>
        </td>
        <td class="text-center">
          <div class="qty-stepper" onclick="event.stopPropagation()">
            <button onclick="changeCartQty(${idx}, -1)">-</button>
            <span>${item.qty}</span>
            <button onclick="changeCartQty(${idx}, 1)">+</button>
          </div>
        </td>
        <td class="text-right font-bold">${formatMoney(lineSub)}</td>
        <td class="text-center" onclick="event.stopPropagation()">
          <button class="btn-del-item" onclick="removeCartItem(${idx})" title="Hapus">✕</button>
        </td>
      </tr>`;
  });

  tbody.innerHTML = html;
  updateCartSummaryUI();
}

// =========================================================================
// 8. KALKULASI TOTAL, DISKON, PAJAK, POIN & PEMBULATAN (TERINTEGRASI ADMIN)
// =========================================================================
function getCheckoutComputation() {
  const prefs = KASIR_COMPANY_PREFS;
  let subtotal = 0;
  let itemDiscountTotal = 0;

  CART.forEach((it) => {
    subtotal += it.harga * it.qty;
    itemDiscountTotal += it.discNominal || 0;
  });

  const afterItemDisc = Math.max(0, subtotal - itemDiscountTotal);

  let globalDisc = 0;
  if (CHECKOUT_STATE.globalDiscType === 'PERCENT') {
    globalDisc = Math.round((afterItemDisc * CHECKOUT_STATE.globalDiscVal) / 100);
  } else {
    globalDisc = Math.min(afterItemDisc, CHECKOUT_STATE.globalDiscVal);
  }

  const afterAllDisc = Math.max(0, afterItemDisc - globalDisc);

  const redeemValPerPt = Number(prefs.pointRedeemVal) || 100;
  const maxRedeemPts = SELECTED_CUSTOMER ? Number(SELECTED_CUSTOMER.poin || 0) : 0;
  const redeemPts = Math.min(CHECKOUT_STATE.redeemPoints || 0, maxRedeemPts);
  const redeemValue = Math.min(afterAllDisc, redeemPts * redeemValPerPt);

  const taxableBase = Math.max(0, afterAllDisc - redeemValue);

  const taxToggleEl = document.getElementById('toggleTaxInput');
  const useTax = taxToggleEl ? taxToggleEl.checked : CHECKOUT_STATE.useTax;
  CHECKOUT_STATE.useTax = useTax;

  let taxAmount = 0;
  let netBeforeRound = taxableBase;

  if (useTax && taxableBase > 0) {
    if (prefs.taxInclusive) {
      taxAmount = Math.round(taxableBase - taxableBase / (1 + CHECKOUT_STATE.taxRate));
      netBeforeRound = taxableBase;
    } else {
      taxAmount = Math.round(taxableBase * CHECKOUT_STATE.taxRate);
      netBeforeRound = taxableBase + taxAmount;
    }
  }

  let netDue = netBeforeRound;
  let roundingDiff = 0;
  const roundStep = Number(prefs.roundStep) || 100;

  if (CHECKOUT_STATE.autoRound && netDue > 0 && roundStep > 0) {
    if (prefs.roundMode === 'UP') {
      netDue = Math.ceil(netDue / roundStep) * roundStep;
    } else {
      netDue = Math.floor(netDue / roundStep) * roundStep;
    }
    roundingDiff = netDue - netBeforeRound;
  }

  return {
    subtotal,
    itemDiscountTotal,
    globalDisc,
    redeemPts,
    redeemValue,
    taxAmount,
    roundingDiff,
    netDue
  };
}

function updateCartSummaryUI() {
  const comp = getCheckoutComputation();

  const subEl = document.getElementById('sumSubtotal');
  const discEl = document.getElementById('sumDiscount');
  const taxEl = document.getElementById('sumTax');
  const grandEl = document.getElementById('sumGrandTotal');
  const grandForeignEl = document.getElementById('sumGrandTotalForeign');

  if (subEl) subEl.textContent = formatMoney(comp.subtotal, true);
  if (discEl) discEl.textContent = '- ' + formatMoney(comp.itemDiscountTotal + comp.globalDisc + comp.redeemValue, true);
  if (taxEl) taxEl.textContent = formatMoney(comp.taxAmount, true);
  if (grandEl) grandEl.textContent = formatMoney(comp.netDue, true);

  if (grandForeignEl) {
    if (CURRENCY_CONFIG.activeCurrency !== 'IDR') {
      grandForeignEl.style.display = 'block';
      grandForeignEl.textContent = `≈ ${formatMoney(comp.netDue, false)}`;
    } else {
      grandForeignEl.style.display = 'none';
    }
  }
}

function openGlobalDiscountModal() {
  if (CART.length === 0) {
    showToast('Keranjang masih kosong', 'warning');
    return;
  }
  const modal = document.getElementById('modalGlobalDisc');
  if (!modal) return;
  document.getElementById('globalDiscType').value = CHECKOUT_STATE.globalDiscType;
  document.getElementById('globalDiscValue').value = CHECKOUT_STATE.globalDiscVal || '';
  modal.classList.add('active');
}

function applyGlobalDiscount() {
  const type = document.getElementById('globalDiscType').value;
  const val = parseFloat(document.getElementById('globalDiscValue').value) || 0;

  if (type === 'PERCENT' && (val < 0 || val > 100)) {
    showToast('Persentase diskon harus 0 - 100%', 'error');
    return;
  }

  CHECKOUT_STATE.globalDiscType = type;
  CHECKOUT_STATE.globalDiscVal = Math.max(0, val);
  closeModal('modalGlobalDisc');
  updateCartSummaryUI();
  syncCustomerDisplay();
}

// =========================================================================
// 9. PARK / HOLD & RECALL ORDER
// =========================================================================
function holdCurrentOrder() {
  if (CART.length === 0) {
    showToast('Tidak ada item di keranjang untuk ditahan', 'warning');
    return;
  }

  const label = prompt('Masukkan catatan / nama meja untuk pesanan yang ditahan:', SELECTED_CUSTOMER?.nama || `Order #${PARKED_CARTS.length + 1}`);
  if (label === null) return;

  PARKED_CARTS.push({
    id: 'HOLD-' + Date.now(),
    label: label.trim() || `Order #${PARKED_CARTS.length + 1}`,
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    cart: JSON.parse(JSON.stringify(CART)),
    customer: SELECTED_CUSTOMER ? JSON.parse(JSON.stringify(SELECTED_CUSTOMER)) : null,
    globalDiscType: CHECKOUT_STATE.globalDiscType,
    globalDiscVal: CHECKOUT_STATE.globalDiscVal
  });

  localStorage.setItem('DANISH_PARKED_CARTS_' + getStoreCode(), JSON.stringify(PARKED_CARTS));

  CART = [];
  SELECTED_CART_INDEX = -1;
  SELECTED_CUSTOMER = null;
  CHECKOUT_STATE.globalDiscVal = 0;
  CHECKOUT_STATE.redeemPoints = 0;

  updateCustomerBoxUI();
  updateParkedBadge();
  renderCart();
  syncCustomerDisplay();
  showToast('Pesanan berhasil ditahan (Hold)', 'success');
}

function openRecallOrderModal() {
  const modal = document.getElementById('modalRecallOrder');
  const listEl = document.getElementById('parkedOrdersList');
  if (!modal || !listEl) return;

  if (PARKED_CARTS.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b;">Tidak ada pesanan yang sedang ditahan.</div>';
  } else {
    let html = '';
    PARKED_CARTS.forEach((p, idx) => {
      const total = p.cart.reduce((s, i) => s + i.harga * i.qty - (i.discNominal || 0), 0);
      html += `
        <div class="parked-order-card">
          <div>
            <div style="font-weight:700; color:#1e293b;">${escapeHtml(p.label)}</div>
            <div style="font-size:12px; color:#64748b;">Jam ${p.time} • ${p.cart.length} item • Total: <b>${formatMoney(total, true)}</b></div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-primary-sm" onclick="restoreParkedOrder(${idx})">Panggil</button>
            <button class="btn-danger-sm" onclick="deleteParkedOrder(${idx})">Hapus</button>
          </div>
        </div>`;
    });
    listEl.innerHTML = html;
  }
  modal.classList.add('active');
}

function restoreParkedOrder(index) {
  const parked = PARKED_CARTS[index];
  if (!parked) return;
  if (CART.length > 0 && !confirm('Keranjang aktif akan digantikan dengan pesanan yang dipanggil. Lanjutkan?')) return;

  CART = parked.cart;
  SELECTED_CUSTOMER = parked.customer;
  CHECKOUT_STATE.globalDiscType = parked.globalDiscType || 'NOMINAL';
  CHECKOUT_STATE.globalDiscVal = parked.globalDiscVal || 0;
  SELECTED_CART_INDEX = CART.length > 0 ? 0 : -1;

  PARKED_CARTS.splice(index, 1);
  localStorage.setItem('DANISH_PARKED_CARTS_' + getStoreCode(), JSON.stringify(PARKED_CARTS));

  updateCustomerBoxUI();
  updateParkedBadge();
  renderCart();
  syncCustomerDisplay();
  closeModal('modalRecallOrder');
  showToast(`Pesanan "${parked.label}" dipanggil kembali`, 'success');
}

function deleteParkedOrder(index) {
  PARKED_CARTS.splice(index, 1);
  localStorage.setItem('DANISH_PARKED_CARTS_' + getStoreCode(), JSON.stringify(PARKED_CARTS));
  updateParkedBadge();
  openRecallOrderModal();
}

function updateParkedBadge() {
  const badge = document.getElementById('parkedCountBadge');
  if (!badge) return;
  badge.textContent = PARKED_CARTS.length;
  badge.style.display = PARKED_CARTS.length > 0 ? 'inline-flex' : 'none';
}

// =========================================================================
// 10. PELANGGAN / MEMBER & PENUKARAN POIN (TERINTEGRASI MemberController.gs)
// =========================================================================
function openCustomerModal() {
  const modal = document.getElementById('modalCustomer');
  if (!modal) return;
  renderCustomerList('');
  modal.classList.add('active');
}

function renderCustomerList(query) {
  const container = document.getElementById('customerSearchList');
  if (!container) return;

  const q = String(query || '').trim().toLowerCase();
  const list = CUSTOMERS.filter((c) => {
    if (!q) return true;
    return `${c.nama || ''} ${c.hp || ''} ${c.kode || ''}`.toLowerCase().includes(q);
  }).slice(0, 30);

  if (list.length === 0) {
    container.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b;">Member tidak ditemukan.</div>';
    return;
  }

  let html = '';
  list.forEach((c) => {
    html += `
      <div class="customer-list-item" onclick="selectCustomerById('${escapeHtml(String(c.id))}')">
        <div>
          <div style="font-weight:700;">${escapeHtml(c.nama)}</div>
          <div style="font-size:12px; color:#64748b;">${escapeHtml(c.hp || '-')} (${escapeHtml(c.kode)})</div>
        </div>
        <div class="member-pts-badge">⭐ ${formatNumber(c.poin || 0)} Poin</div>
      </div>`;
  });
  container.innerHTML = html;
}

function selectCustomerById(id) {
  const cust = CUSTOMERS.find((c) => String(c.id) === String(id));
  if (!cust) return;
  SELECTED_CUSTOMER = cust;
  CHECKOUT_STATE.redeemPoints = 0;
  updateCustomerBoxUI();
  updateCartSummaryUI();
  closeModal('modalCustomer');
  showToast(`Member dipilih: ${cust.nama}`, 'success');
}

function clearSelectedCustomer() {
  SELECTED_CUSTOMER = null;
  CHECKOUT_STATE.redeemPoints = 0;
  updateCustomerBoxUI();
  updateCartSummaryUI();
}

function updateCustomerBoxUI() {
  const nameEl = document.getElementById('selectedCustomerName');
  const ptsEl = document.getElementById('selectedCustomerPts');
  const clearBtn = document.getElementById('btnClearCustomer');

  if (!nameEl) return;
  if (SELECTED_CUSTOMER) {
    nameEl.textContent = SELECTED_CUSTOMER.nama;
    if (ptsEl) ptsEl.textContent = `⭐ ${formatNumber(SELECTED_CUSTOMER.poin || 0)} Poin`;
    if (clearBtn) clearBtn.style.display = 'inline-block';
  } else {
    nameEl.textContent = 'Pelanggan Umum (Walk-in)';
    if (ptsEl) ptsEl.textContent = '';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

async function quickRegisterMember() {
  const nama = document.getElementById('newMemberName')?.value.trim();
  const hp = document.getElementById('newMemberPhone')?.value.trim();
  if (!nama || !hp) {
    showToast('Nama dan No. HP member wajib diisi', 'error');
    return;
  }

  const newCust = {
    id: 'MBR-' + Date.now().toString().slice(-6),
    kode: 'MBR-' + Math.floor(1000 + Math.random() * 9000),
    nama,
    hp,
    poin: 0
  };

  CUSTOMERS.unshift(newCust);
  SELECTED_CUSTOMER = newCust;
  updateCustomerBoxUI();
  closeModal('modalCustomer');
  showToast('Member baru terdaftar & dipilih', 'success');

  try {
    await ApiClient.call('member/save', {
      member_id: newCust.id,
      card_code: newCust.kode,
      name: nama,
      phone: hp
    });
  } catch (e) {
    console.warn('Member baru disimpan lokal');
  }
}

// =========================================================================
// 11. CHECKOUT, SPLIT PAYMENT & QRIS HYBRID ENGINE (TERINTEGRASI QrisGateway.gs)
// =========================================================================
function openCheckoutModal() {
  if (CART.length === 0) {
    showToast('Keranjang belanja masih kosong!', 'warning');
    return;
  }

  const modal = document.getElementById('modalCheckout');
  if (!modal) return;

  CHECKOUT_STATE.payments = [];
  CHECKOUT_STATE.activePayMethod = 'CASH';
  CHECKOUT_STATE.redeemPoints = 0;

  const redeemWrap = document.getElementById('checkoutRedeemWrap');
  const redeemInput = document.getElementById('checkoutRedeemPtsInput');
  const redeemAvail = document.getElementById('checkoutAvailPts');
  if (redeemWrap && redeemInput && redeemAvail) {
    if (SELECTED_CUSTOMER && Number(SELECTED_CUSTOMER.poin) > 0) {
      redeemWrap.style.display = 'flex';
      redeemAvail.textContent = formatNumber(SELECTED_CUSTOMER.poin);
      redeemInput.max = SELECTED_CUSTOMER.poin;
      redeemInput.value = 0;
    } else {
      redeemWrap.style.display = 'none';
    }
  }

  selectPaymentMethodTab('CASH');
  refreshCheckoutModalUI();
  modal.classList.add('active');

  setTimeout(() => {
    const payInput = document.getElementById('checkoutPayAmountInput');
    if (payInput) {
      const comp = getCheckoutComputation();
      payInput.value = comp.netDue;
      payInput.select();
    }
  }, 100);
}

function onRedeemPointsChange(val) {
  const maxPts = SELECTED_CUSTOMER ? Number(SELECTED_CUSTOMER.poin || 0) : 0;
  let pts = parseInt(val, 10) || 0;
  if (pts < 0) pts = 0;
  if (pts > maxPts) pts = maxPts;
  CHECKOUT_STATE.redeemPoints = pts;
  refreshCheckoutModalUI();
}

function selectPaymentMethodTab(method) {
  CHECKOUT_STATE.activePayMethod = method;
  document.querySelectorAll('.pay-method-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });

  const refWrap = document.getElementById('checkoutRefWrap');
  const qrisPanel = document.getElementById('checkoutQrisPanel');

  if (refWrap) refWrap.style.display = method === 'CASH' ? 'none' : 'block';
  if (qrisPanel) qrisPanel.style.display = method === 'QRIS' ? 'block' : 'none';

  const comp = getCheckoutComputation();
  const totalPaid = CHECKOUT_STATE.payments.reduce((s, p) => s + p.amountIdr, 0);
  const remaining = Math.max(0, comp.netDue - totalPaid);

  const payInput = document.getElementById('checkoutPayAmountInput');
  if (payInput) payInput.value = remaining;

  if (method === 'QRIS') {
    triggerHybridQrisDisplay(remaining > 0 ? remaining : comp.netDue);
  }
}

function selectFullPaymentPreset(mode) {
  const comp = getCheckoutComputation();
  const totalPaid = CHECKOUT_STATE.payments.reduce((s, p) => s + p.amountIdr, 0);
  const remaining = Math.max(0, comp.netDue - totalPaid);
  const payInput = document.getElementById('checkoutPayAmountInput');

  if (mode === 'EXACT') {
    if (payInput) payInput.value = remaining;
  } else if (mode === 'QRIS') {
    selectPaymentMethodTab('QRIS');
    if (payInput) payInput.value = remaining;
    triggerHybridQrisDisplay(remaining);
  } else {
    const nominal = parseInt(mode, 10) || 0;
    if (payInput) payInput.value = nominal;
  }
}

function addSplitPaymentLine() {
  const payInput = document.getElementById('checkoutPayAmountInput');
  const refInput = document.getElementById('checkoutPayRefInput');
  const rawAmount = parseFloat(payInput?.value) || 0;

  if (rawAmount <= 0) {
    showToast('Masukkan nominal pembayaran yang valid', 'warning');
    return;
  }

  const amountIdr =
    CURRENCY_CONFIG.activeCurrency === 'IDR'
      ? Math.round(rawAmount)
      : Math.round(rawAmount * CURRENCY_CONFIG.rateToIdr);

  CHECKOUT_STATE.payments.push({
    method: CHECKOUT_STATE.activePayMethod,
    amountIdr: amountIdr,
    ref: refInput?.value.trim() || ''
  });

  if (refInput) refInput.value = '';
  refreshCheckoutModalUI();

  const comp = getCheckoutComputation();
  const totalPaid = CHECKOUT_STATE.payments.reduce((s, p) => s + p.amountIdr, 0);
  const remaining = Math.max(0, comp.netDue - totalPaid);
  if (payInput) payInput.value = remaining;
}

function removeSplitPaymentLine(idx) {
  CHECKOUT_STATE.payments.splice(idx, 1);
  refreshCheckoutModalUI();
}

function refreshCheckoutModalUI() {
  const comp = getCheckoutComputation();
  const totalPaid = CHECKOUT_STATE.payments.reduce((s, p) => s + p.amountIdr, 0);
  const remaining = Math.max(0, comp.netDue - totalPaid);
  const change = Math.max(0, totalPaid - comp.netDue);

  const dueEl = document.getElementById('checkoutNetDueDisplay');
  const paidEl = document.getElementById('checkoutPaidDisplay');
  const remEl = document.getElementById('checkoutRemainingDisplay');
  const chgEl = document.getElementById('checkoutChangeDisplay');
  const listEl = document.getElementById('checkoutSplitList');

  if (dueEl) dueEl.textContent = formatMoney(comp.netDue, true);
  if (paidEl) paidEl.textContent = formatMoney(totalPaid, true);
  if (remEl) remEl.textContent = formatMoney(remaining, true);
  if (chgEl) chgEl.textContent = formatMoney(change, true);

  if (listEl) {
    if (CHECKOUT_STATE.payments.length === 0) {
      listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Belum ada rincian pembayaran ditambahkan (atau klik Selesaikan untuk bayar penuh).</div>';
    } else {
      let html = '';
      CHECKOUT_STATE.payments.forEach((p, idx) => {
        html += `
          <div class="split-pay-row">
            <span><b>${p.method}</b> ${p.ref ? `(${escapeHtml(p.ref)})` : ''}</span>
            <span>
              <b>${formatMoney(p.amountIdr, true)}</b>
              <button onclick="removeSplitPaymentLine(${idx})" style="margin-left:8px; color:#ef4444; background:none; border:none; cursor:pointer;">✕</button>
            </span>
          </div>`;
      });
      listEl.innerHTML = html;
    }
  }
}

async function triggerHybridQrisDisplay(amountIdr) {
  const statusEl = document.getElementById('qrisHybridStatus');
  const roundedAmt = Math.round(amountIdr);

  // Jika mode API_GATEWAY (Midtrans/Xendit) aktif di QrisGateway.gs
  if (CHECKOUT_STATE.qrisMode === 'API_GATEWAY') {
    if (statusEl) statusEl.textContent = '⏳ Membuat kode QRIS dinamis via Payment Gateway...';
    try {
      const gwRes = await ApiClient.call('pos/qris-create', {
        kodeToko: getStoreCode(),
        orderId: 'QR-' + Date.now(),
        amount: roundedAmt
      });
      if (gwRes && !gwRes.fallbackOffline && gwRes.qrString) {
        CHECKOUT_STATE.qrisDynamicPayload = gwRes.qrString;
        if (statusEl) statusEl.textContent = `✅ QRIS Gateway siap (Rp ${formatNumber(roundedAmt)}) & dikirim ke Layar Pelanggan.`;
        syncCustomerDisplay(gwRes.qrString, roundedAmt);
        return;
      }
    } catch (e) {}
  }

  // Mode Offline EMVCo Dynamic QRIS dari staticPayload
  if (!CHECKOUT_STATE.qrisStaticString) {
    if (statusEl) {
      statusEl.textContent = '⚠️ String QRIS Statis belum diatur di Admin. Pelanggan dapat scan QRIS fisik di meja.';
    }
    return;
  }

  try {
    const dynamicQris = buildDynamicQrisString(CHECKOUT_STATE.qrisStaticString, roundedAmt);
    CHECKOUT_STATE.qrisDynamicPayload = dynamicQris;

    if (statusEl) {
      statusEl.textContent = `✅ QRIS Dinamis siap (Rp ${formatNumber(roundedAmt)}) & dikirim ke Layar Pelanggan.`;
    }
    syncCustomerDisplay(dynamicQris, roundedAmt);
  } catch (e) {
    console.warn('Gagal generate QRIS dinamis:', e);
  }
}

function buildDynamicQrisString(staticQris, amount) {
  let qris = String(staticQris).trim();
  if (qris.length < 20) return qris;
  if (qris.slice(-8, -4) === '6304') qris = qris.slice(0, -4);
  qris = qris.replace('010211', '010212');
  const amtStr = String(amount);
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;
  if (qris.includes('5802ID')) qris = qris.replace('5802ID', tag54 + '5802ID');
  else qris += tag54;
  return qris + computeCrc16Ccitt(qris);
}

function computeCrc16Ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

// =========================================================================
// 12. PROSES FINAL TRANSAKSI, SHA-256 CHECKSUM & SINKRONISASI PosController.gs
// =========================================================================
async function sha256Hex(message) {
  try {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return '';
  }
}

async function processFinalPayment() {
  if (CART.length === 0) return;

  const comp = getCheckoutComputation();
  const prefs = KASIR_COMPANY_PREFS;
  const storeCode = getStoreCode();

  if (CHECKOUT_STATE.payments.length === 0) {
    const payInput = document.getElementById('checkoutPayAmountInput');
    const refInput = document.getElementById('checkoutPayRefInput');
    const rawAmount = parseFloat(payInput?.value) || 0;
    const amountIdr =
      CURRENCY_CONFIG.activeCurrency === 'IDR'
        ? Math.round(rawAmount)
        : Math.round(rawAmount * CURRENCY_CONFIG.rateToIdr);

    if (amountIdr < comp.netDue) {
      showToast(`Pembayaran kurang Rp ${formatNumber(comp.netDue - amountIdr)}`, 'error');
      return;
    }

    CHECKOUT_STATE.payments.push({
      method: CHECKOUT_STATE.activePayMethod,
      amountIdr: amountIdr,
      ref: refInput?.value.trim() || ''
    });
  }

  const totalPaid = CHECKOUT_STATE.payments.reduce((s, p) => s + p.amountIdr, 0);
  if (totalPaid < comp.netDue) {
    showToast(`Total pembayaran masih kurang Rp ${formatNumber(comp.netDue - totalPaid)}`, 'error');
    return;
  }

  const changeAmount = totalPaid - comp.netDue;
  const prefix = prefs.prefixStruk || 'TRX-';
  const trxId = `${prefix}${storeCode}-${Date.now()}`;
  const shiftId = ACTIVE_SHIFT?.shiftId || `SHF-${storeCode}-DEFAULT`;
  const cashierId = SESSION.user.idUser || SESSION.user.username;
  const timestamp = new Date().toISOString();

  const earnStep = Number(prefs.pointEarnStep) || 10000;
  const earnedPts = SELECTED_CUSTOMER && earnStep > 0 ? Math.floor(comp.netDue / earnStep) : 0;

  // Format item & payload sesuai kontrak PosController.gs -> syncTransactions
  const backendItems = CART.map((it) => ({
    barcode: it.barcode || it.sku,
    sku_code: it.sku,
    name: it.nama,
    unit: it.satuan || 'PCS',
    conversion_qty: Number(it.conversionQty) || 1,
    price: it.harga,
    qty: it.qty,
    disc_nominal: it.discNominal || 0,
    is_non_physical: Boolean(it.isCustom)
  }));

  const backendPayments = CHECKOUT_STATE.payments.map((p) => ({
    method: p.method,
    amount: p.amountIdr,
    ref: p.ref || ''
  }));

  const itemsJsonStr = JSON.stringify(backendItems);
  const paymentsJsonStr = JSON.stringify(backendPayments);
  const totalDiscountAll = comp.itemDiscountTotal + comp.globalDisc + comp.redeemValue;

  // Checksum SHA-256 sesuai rumus PosController.gs: `${trx.trx_id}|${trx.shift_id}|${totalKasir}|${trx.items_json}`
  const rawSignature = `${trxId}|${shiftId}|${comp.netDue}|${itemsJsonStr}`;
  const checksum = await sha256Hex(rawSignature);

  const serverTrxRecord = {
    trx_id: trxId,
    shift_id: shiftId,
    timestamp: timestamp,
    cashier_id: cashierId,
    trx_type: 'SALE',
    items_json: itemsJsonStr,
    promo_applied_json: '[]',
    discount_total: totalDiscountAll,
    tax_amount: comp.taxAmount,
    grand_total: comp.netDue,
    payments_json: paymentsJsonStr,
    checksum: checksum,
    member_id: SELECTED_CUSTOMER ? SELECTED_CUSTOMER.id : 'MBR-000',
    points_redeemed: comp.redeemPts
  };

  // Objek untuk cetak struk & riwayat lokal
  const localReceiptObj = {
    trxId,
    tanggal: timestamp,
    kodeToko: storeCode,
    namaToko: prefs.companyName || SESSION.store.namaToko,
    kasirNama: SESSION.user.nama || SESSION.user.username,
    customer: SELECTED_CUSTOMER ? { id: SELECTED_CUSTOMER.id, nama: SELECTED_CUSTOMER.nama } : null,
    items: CART.map((it) => ({
      nama: it.nama,
      satuan: it.satuan,
      qty: it.qty,
      harga: it.harga,
      discNominal: it.discNominal || 0,
      subtotal: it.harga * it.qty - (it.discNominal || 0)
    })),
    subtotal: comp.subtotal,
    totalDiskon: comp.itemDiscountTotal + comp.globalDisc,
    redeemPoints: comp.redeemPts,
    redeemValue: comp.redeemValue,
    earnedPoints: earnedPts,
    pajak: comp.taxAmount,
    pembulatan: comp.roundingDiff,
    grandTotal: comp.netDue,
    totalBayar: totalPaid,
    kembalian: changeAmount,
    payments: CHECKOUT_STATE.payments
  };

  // Update stok lokal
  CART.forEach((sold) => {
    const pIdx = PRODUCTS.findIndex((p) => String(p.id) === String(sold.id));
    if (pIdx > -1 && PRODUCTS[pIdx].trackStock !== false) {
      PRODUCTS[pIdx].stok = Math.max(0, Number(PRODUCTS[pIdx].stok || 0) - sold.qty);
    }
  });
  localStorage.setItem('DANISH_PRODUCTS_' + storeCode, JSON.stringify(PRODUCTS));

  if (SELECTED_CUSTOMER) {
    SELECTED_CUSTOMER.poin = Math.max(0, Number(SELECTED_CUSTOMER.poin || 0) - comp.redeemPts + earnedPts);
    const cIdx = CUSTOMERS.findIndex((c) => String(c.id) === String(SELECTED_CUSTOMER.id));
    if (cIdx > -1) CUSTOMERS[cIdx].poin = SELECTED_CUSTOMER.poin;
    localStorage.setItem('DANISH_CUSTOMERS_' + storeCode, JSON.stringify(CUSTOMERS));
  }

  saveTransactionToLocalHistory(localReceiptObj);
  enqueueOfflineTransaction(serverTrxRecord);
  syncOfflineTransactions();

  printThermalReceipt(localReceiptObj);

  closeModal('modalCheckout');
  CART = [];
  SELECTED_CART_INDEX = -1;
  CHECKOUT_STATE.globalDiscVal = 0;
  CHECKOUT_STATE.redeemPoints = 0;
  CHECKOUT_STATE.payments = [];
  CHECKOUT_STATE.qrisDynamicPayload = '';
  SELECTED_CUSTOMER = null;

  updateCustomerBoxUI();
  renderProductGrid();
  renderCart();
  syncCustomerDisplay();

  showToast(`Transaksi Berhasil! Kembalian: Rp ${formatNumber(changeAmount)}`, 'success');
}

function printThermalReceipt(trx) {
  const prefs = KASIR_COMPANY_PREFS;
  const storeDisplayName = prefs.companyName || trx.namaToko || SESSION.store.namaToko;
  const storeDisplayAddr = prefs.companyAddress || SESSION.store.alamat || '';
  const storeDisplayPhone = prefs.companyPhone ? `<br>Telp: ${escapeHtml(prefs.companyPhone)}` : '';
  const footerText = prefs.receiptFooter || 'Terima Kasih Atas Kunjungan Anda';
  const logoSrc = prefs.logoBase64 || prefs.logoUrl || '';

  const printArea = document.getElementById('thermalPrintArea');
  if (!printArea) return;

  let itemsHtml = '';
  trx.items.forEach((it) => {
    itemsHtml += `
      <div style="margin-bottom:4px;">
        <div style="font-weight:bold;">${escapeHtml(it.nama)}</div>
        <div style="display:flex; justify-content:space-between; font-size:11px;">
          <span>${it.qty} ${escapeHtml(it.satuan || '')} x ${formatNumber(it.harga)}</span>
          <span>${formatNumber(it.subtotal)}</span>
        </div>
        ${it.discNominal > 0 ? `<div style="font-size:10px; text-align:right;">(Diskon: -${formatNumber(it.discNominal)})</div>` : ''}
      </div>`;
  });

  let paymentsHtml = '';
  trx.payments.forEach((p) => {
    paymentsHtml += `
      <div style="display:flex; justify-content:space-between;">
        <span>Bayar (${p.method})</span>
        <span>${formatNumber(p.amountIdr)}</span>
      </div>`;
  });

  printArea.innerHTML = `
    <div style="width: 58mm; font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 4px;">
      <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">
        ${logoSrc ? `<img src="${logoSrc}" style="max-width:42mm; max-height:18mm; object-fit:contain; margin-bottom:4px;"><br>` : ''}
        <strong style="font-size:14px;">${escapeHtml(storeDisplayName)}</strong><br>
        ${storeDisplayAddr ? `<span style="font-size:11px;">${escapeHtml(storeDisplayAddr)}</span>` : ''}
        ${storeDisplayPhone ? `<span style="font-size:11px;">${storeDisplayPhone}</span>` : ''}
      </div>
      <div style="font-size:11px; border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">
        <div>No   : ${escapeHtml(trx.trxId)}</div>
        <div>Tgl  : ${new Date(trx.tanggal).toLocaleString('id-ID')}</div>
        <div>Kasir: ${escapeHtml(trx.kasirNama)}</div>
        ${trx.customer ? `<div>Member: ${escapeHtml(trx.customer.nama)}</div>` : ''}
      </div>
      <div style="border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">
        ${itemsHtml}
      </div>
      <div style="font-size:11px; border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>${formatNumber(trx.subtotal)}</span></div>
        ${trx.totalDiskon > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Diskon</span><span>-${formatNumber(trx.totalDiskon)}</span></div>` : ''}
        ${trx.redeemValue > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Tukar Poin (${trx.redeemPoints} pt)</span><span>-${formatNumber(trx.redeemValue)}</span></div>` : ''}
        ${trx.pajak > 0 ? `<div style="display:flex; justify-content:space-between;"><span>PPN</span><span>${formatNumber(trx.pajak)}</span></div>` : ''}
        ${trx.pembulatan !== 0 ? `<div style="display:flex; justify-content:space-between;"><span>Pembulatan</span><span>${formatNumber(trx.pembulatan)}</span></div>` : ''}
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:13px; margin-top:4px;">
          <span>TOTAL</span><span>Rp ${formatNumber(trx.grandTotal)}</span>
        </div>
        ${paymentsHtml}
        <div style="display:flex; justify-content:space-between; font-weight:bold;">
          <span>KEMBALI</span><span>Rp ${formatNumber(trx.kembalian)}</span>
        </div>
      </div>
      ${
        trx.customer
          ? `<div style="font-size:10px; text-align:center; margin-bottom:6px;">
              Poin Didapat: +${trx.earnedPoints} | Saldo Poin: ${SELECTED_CUSTOMER?.poin || 0}
             </div>`
          : ''
      }
      <div style="text-align:center; font-size:11px; margin-top:6px;">
        ${escapeHtml(footerText)}
      </div>
    </div>`;

  window.print();
}

// =========================================================================
// 13. OFFLINE QUEUE (pos/sync-trx), RIWAYAT & CUSTOMER DISPLAY SYNC
// =========================================================================
function saveTransactionToLocalHistory(trx) {
  const key = 'DANISH_TRX_HISTORY_' + getStoreCode();
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift(trx);
    if (list.length > 200) list.length = 200;
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {}
}

function enqueueOfflineTransaction(serverTrxRecord) {
  const key = 'DANISH_OFFLINE_QUEUE_' + getStoreCode();
  try {
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    queue.push(serverTrxRecord);
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {}
  updateSyncStatusBadge();
}

async function syncOfflineTransactions() {
  const key = 'DANISH_OFFLINE_QUEUE_' + getStoreCode();
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {}

  if (queue.length === 0) {
    updateSyncStatusBadge();
    return;
  }

  try {
    const res = await ApiClient.call('pos/sync-trx', {
      kodeToko: getStoreCode(),
      transactions: queue
    });

    const syncedSet = new Set((res && res.syncedIds) || []);
    const remaining = queue.filter((t) => !syncedSet.has(t.trx_id));
    localStorage.setItem(key, JSON.stringify(remaining));
  } catch (err) {
    console.warn('Sinkronisasi transaksi tertunda (Offline):', err);
  }

  updateSyncStatusBadge();
}

function updateSyncStatusBadge() {
  const badge = document.getElementById('posSyncBadge');
  if (!badge) return;
  const key = 'DANISH_OFFLINE_QUEUE_' + getStoreCode();
  let pendingCount = 0;
  try {
    pendingCount = JSON.parse(localStorage.getItem(key) || '[]').length;
  } catch (e) {}

  if (!navigator.onLine) {
    badge.className = 'sync-badge offline';
    badge.textContent = `Offline (${pendingCount} antre)`;
  } else if (pendingCount > 0) {
    badge.className = 'sync-badge syncing';
    badge.textContent = `Sinkronisasi (${pendingCount})...`;
  } else {
    badge.className = 'sync-badge online';
    badge.textContent = 'Cloud Terhubung';
  }
}

function syncCustomerDisplay(qrisPayload = '', qrisAmount = 0) {
  const comp = getCheckoutComputation();
  const payload = {
    updatedAt: Date.now(),
    storeName: KASIR_COMPANY_PREFS.companyName || SESSION?.store?.namaToko || 'DANISH POS',
    logoSrc: KASIR_COMPANY_PREFS.logoBase64 || KASIR_COMPANY_PREFS.logoUrl || '',
    promoText: KASIR_DESIGN_CFG.promoText || '',
    items: CART.map((it) => ({
      nama: it.nama,
      qty: it.qty,
      harga: it.harga,
      subtotal: it.harga * it.qty - (it.discNominal || 0)
    })),
    subtotal: comp.subtotal,
    discount: comp.itemDiscountTotal + comp.globalDisc + comp.redeemValue,
    tax: comp.taxAmount,
    grandTotal: comp.netDue,
    qrisDynamicPayload: qrisPayload || CHECKOUT_STATE.qrisDynamicPayload || '',
    qrisAmount: qrisAmount || comp.netDue
  };

  try {
    localStorage.setItem('DANISH_CUSTOMER_DISPLAY_STATE', JSON.stringify(payload));
  } catch (e) {}
}

function openCustomerDisplayWindow() {
  syncCustomerDisplay();
  window.open('display.html', 'DanishCustomerDisplay', 'width=1024,height=768');
}

function openHistoryModal() {
  const modal = document.getElementById('modalHistory');
  const listEl = document.getElementById('trxHistoryList');
  if (!modal || !listEl) return;

  const key = 'DANISH_TRX_HISTORY_' + getStoreCode();
  const list = JSON.parse(localStorage.getItem(key) || '[]');

  if (list.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b;">Belum ada riwayat transaksi di perangkat ini.</div>';
  } else {
    let html = '';
    list.slice(0, 30).forEach((trx, idx) => {
      html += `
        <div class="history-trx-card">
          <div>
            <div style="font-weight:700; color:#1e293b;">${escapeHtml(trx.trxId)}</div>
            <div style="font-size:12px; color:#64748b;">${new Date(trx.tanggal).toLocaleString('id-ID')} • ${trx.items.length} item</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700; color:#059669;">Rp ${formatNumber(trx.grandTotal)}</div>
            <button class="btn-secondary-sm" style="margin-top:4px;" onclick="reprintHistoryTrx(${idx})">🖨️ Cetak Ulang</button>
          </div>
        </div>`;
    });
    listEl.innerHTML = html;
  }

  modal.classList.add('active');
}

function reprintHistoryTrx(index) {
  const key = 'DANISH_TRX_HISTORY_' + getStoreCode();
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  if (list[index]) printThermalReceipt(list[index]);
}

function triggerCashDrawer() {
  showToast('Perintah buka laci kasir (Cash Drawer) dikirim', 'info');
  const printArea = document.getElementById('thermalPrintArea');
  if (printArea) {
    printArea.innerHTML = '<div style="font-size:1px; color:#fff;">.</div>';
    window.print();
  }
}

// =========================================================================
// 14. KEYBOARD SHORTCUTS, MODAL & HELPER UTILITIES
// =========================================================================
function bindGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      document.getElementById('posSearchInput')?.focus();
    } else if (e.key === 'F4') {
      e.preventDefault();
      holdCurrentOrder();
    } else if (e.key === 'F8') {
      e.preventDefault();
      openCheckoutModal();
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
    }
  });

  window.addEventListener('online', () => {
    updateSyncStatusBadge();
    syncOfflineTransactions();
  });
  window.addEventListener('offline', updateSyncStatusBadge);
}

function bindModalEnterKeys() {
  const payInput = document.getElementById('checkoutPayAmountInput');
  if (payInput) {
    payInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        processFinalPayment();
      }
    });
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'info') {
  let container = document.getElementById('posToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'posToastContainer';
    container.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:8px;';
    document.body.appendChild(container);
  }

  const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#1a56db' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:${colors[type] || colors.info}; color:#fff; padding:10px 16px; border-radius:8px; font-size:13px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.18); transition:opacity 0.3s;`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function playBeepSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}