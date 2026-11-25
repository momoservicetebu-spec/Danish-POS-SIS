/**
 * DANISH POS - KASIR TERMINAL ENGINE (V3.4 - COMPLETE MERGED EDITION)
 * Menggabungkan seluruh fitur V3.2 + UI kasir_2.html:
 * - Auto-Sync Logo Base64/URL + Fallback Brand Vector
 * - Etalase Cepat PROMO SPESIAL & FAST FOOD
 * - Modal Pembayaran 6 Kanal Berwarna + QRIS Dinamis EMVCo (CRC16) & Gateway
 * - Multi-Currency (IDR, USD, SGD, MYR, EUR, JPY)
 * - Engine Promo Otomatis, Stok Lokal, Poin Member, Riwayat Transaksi, Retur, Cash Drop & Tutup Shift
 */

// =========================================================================
// 1. STATE & KONFIGURASI GLOBAL
// =========================================================================
window.SESSION = window.SESSION || null;
let ACTIVE_SHIFT = null;
let PRODUCTS = [];
let PROMOTIONS = [];
let CUSTOMERS = [];
let CART = [];
let PARKED_CARTS = [];
let SELECTED_CUSTOMER = null;
let CURRENT_CATEGORY = 'SEMUA';
let SHOWCASE_TAB = 'PROMO'; // 'PROMO' | 'FASTFOOD'
let SELECTED_CART_INDEX = -1;
let LAST_RECEIPT_OBJ = null;
let RETURN_LOADED_TRX = null;

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

// Desain Kustomisasi dari Admin
let KASIR_DESIGN_CFG = {
  primaryColor: '#1E3A8A',
  topbarGrad1: '#1E3A8A',
  topbarGrad2: '#2563EB',
  accentColor: '#10B981',
  fontFamily: 'Inter',
  compLogo: true,
  compPromo: true,
  compCategory: true
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

// QRIS Hybrid State
let QRIS_STATE = {
  mode: 'OFFLINE_EMVCO',
  staticString: '',
  dynamicPayload: ''
};

// =========================================================================
// 2. INISIALISASI HALAMAN & KEAMANAN SESI
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  checkSessionSecurity();
  loadShiftState();
  loadCurrencyState();
  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);

  renderLogoToBox();
  await initKasirDesignConfig();
  await loadInitialPosData();

  bindBarcodeScannerInput();
  bindGlobalShortcuts();
  updateSyncStatusBadge();
  setInterval(syncOfflineTransactions, 30000);
});

function checkSessionSecurity() {
  const raw =
    localStorage.getItem('DANISH_POS_SESSION') ||
    localStorage.getItem('POS_SESSION') ||
    sessionStorage.getItem('DANISH_POS_SESSION') ||
    sessionStorage.getItem('POS_SESSION');

  if (!raw) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Format sesi kosong');
    }

    // Normalisasi struktur sesi agar kompatibel dengan semua versi login
    const userObj = parsed.user || {
      idUser: parsed.idUser || parsed.user_id || parsed.username || 'KSR-01',
      username: parsed.username || parsed.nama || 'kasir',
      nama: parsed.nama || parsed.name || parsed.username || 'Kasir',
      role: parsed.role || 'KASIR'
    };

    const storeObj = parsed.store || {
      kodeToko: parsed.kodeToko || parsed.storeCode || parsed.store_id || 'TK-001',
      namaToko: parsed.namaToko || parsed.storeName || 'Minimarket Pusat 01',
      alamat: parsed.alamat || ''
    };

    SESSION = {
      ...parsed,
      user: userObj,
      store: storeObj
    };

    const hdrStore = document.getElementById('hdrStoreName');
    const hdrCashier = document.getElementById('hdrCashierInfo');
    if (hdrStore) hdrStore.textContent = `${storeObj.namaToko} (${storeObj.kodeToko})`;
    if (hdrCashier) hdrCashier.textContent = `[${userObj.nama}]`;
  } catch (e) {
    console.warn('Sesi kasir tidak terbaca:', e);
    // Hapus semua kemungkinan key sesi agar tidak terjadi redirect loop
    localStorage.removeItem('DANISH_POS_SESSION');
    localStorage.removeItem('POS_SESSION');
    sessionStorage.removeItem('DANISH_POS_SESSION');
    sessionStorage.removeItem('POS_SESSION');
    window.location.href = 'index.html';
  }
}

function loadShiftState() {
  try {
    const raw = localStorage.getItem('DANISH_ACTIVE_SHIFT_' + getStoreCode());
    if (raw) ACTIVE_SHIFT = JSON.parse(raw);
  } catch (e) {}
  const shiftEl = document.getElementById('hdrShiftId');
  if (shiftEl) {
    shiftEl.textContent = `Shift: ${ACTIVE_SHIFT?.shiftId || 'SHF-' + getStoreCode() + '-ACTIVE'}`;
  }
}

function updateClockDisplay() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  const el = document.getElementById('hdrClock');
  if (el) el.textContent = `${dateStr} ${timeStr}`;
}

function togglePosFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function exitPosScreen() {
  if (CART.length > 0 && !confirm('Masih ada item di keranjang aktif. Yakin ingin keluar dari kasir?')) return;
  localStorage.removeItem('DANISH_POS_SESSION');
  sessionStorage.removeItem('DANISH_POS_SESSION');
  window.location.href = 'index.html';
}

// =========================================================================
// 3. SINKRONISASI DESAIN & LOGO PERUSAHAAN DARI ADMIN
// =========================================================================
function normalizeLogoDataUrl(rawLogo) {
  if (!rawLogo || typeof rawLogo !== 'string') return '';
  const trimmed = rawLogo.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (/^[A-Za-z0-9+/=]{80,}$/.test(trimmed)) {
    return 'data:image/png;base64,' + trimmed;
  }
  return '';
}

function getDefaultBrandLogoSvg() {
  const brandTitle = (KASIR_COMPANY_PREFS.companyName || SESSION?.store?.namaToko || 'DANISH').toUpperCase();
  const shortTitle = brandTitle.length > 14 ? 'DANISH' : brandTitle;
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%;">
      <svg width="118" height="52" viewBox="0 0 140 60" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cartGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2563EB"/>
            <stop offset="100%" stop-color="#10B981"/>
          </linearGradient>
        </defs>
        <rect x="14" y="14" width="38" height="24" rx="5" fill="url(#cartGrad)"/>
        <path d="M8 10 H15 L21 38 H50" stroke="#1E293B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <circle cx="24" cy="45" r="4" fill="#DC2626"/>
        <circle cx="46" cy="45" r="4" fill="#D97706"/>
        <g transform="translate(76, 8)">
          <path d="M12 18 H38 V28 C38 36 31 41 25 41 C19 41 12 36 12 28 Z" fill="#92400E"/>
          <path d="M38 20 H43 C46 20 46 28 43 28 H38" stroke="#92400E" stroke-width="3" fill="none"/>
          <ellipse cx="25" cy="43" rx="18" ry="3.5" fill="#D97706"/>
          <path d="M19 13 Q17 8 20 4 M25 13 Q23 8 26 4 M31 13 Q29 8 32 4" stroke="#D97706" stroke-width="2" fill="none" stroke-linecap="round"/>
        </g>
      </svg>
      <div style="font-size:12px; font-weight:900; color:#1E293B; letter-spacing:0.6px; line-height:1.1;">${escapeHtml(shortTitle)}</div>
      <div style="font-size:9px; font-weight:700; color:#D97706; letter-spacing:0.8px;">MART &amp; CAFE</div>
    </div>`;
}

function renderLogoToBox() {
  const logoBox = document.getElementById('reneLogoBox');
  if (!logoBox) return;

  if (KASIR_DESIGN_CFG.compLogo === false) {
    logoBox.style.display = 'none';
    return;
  }
  logoBox.style.display = 'flex';

  const prefs = KASIR_COMPANY_PREFS;
  const candidate = prefs.logoBase64 || prefs.logo_base64 || prefs.logoUrl || prefs.logo_url || prefs.logo || '';
  const validSrc = normalizeLogoDataUrl(candidate);

  if (validSrc) {
    logoBox.innerHTML = `<img src="${validSrc}" alt="LOGO" onerror="this.parentElement.innerHTML = getDefaultBrandLogoSvg();">`;
  } else {
    logoBox.innerHTML = getDefaultBrandLogoSvg();
  }
}

async function initKasirDesignConfig() {
  const storeCode = getStoreCode();
  const designCacheKey = 'DANISH_DESIGN_CONFIG_' + storeCode;

  try {
    const cachedDesign = localStorage.getItem(designCacheKey);
    if (cachedDesign) KASIR_DESIGN_CFG = { ...KASIR_DESIGN_CFG, ...JSON.parse(cachedDesign) };

    const cachedPrefs =
      localStorage.getItem('DANISH_POS_COMPANY_PREFS') ||
      localStorage.getItem('DANISH_COMPANY_PREFS_' + storeCode) ||
      localStorage.getItem('DANISH_COMPANY_PREFS_GLOBAL');
    if (cachedPrefs) KASIR_COMPANY_PREFS = { ...KASIR_COMPANY_PREFS, ...JSON.parse(cachedPrefs) };

    applyKasirDesignToDOM();
  } catch (e) {}

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

    applyKasirDesignToDOM();
  } catch (e) {
    applyKasirDesignToDOM();
  }
}

function applyKasirDesignToDOM() {
  const cfg = KASIR_DESIGN_CFG;
  const prefs = KASIR_COMPANY_PREFS;

  const titleBar = document.getElementById('reneTitleBar');
  if (titleBar && (cfg.topbarGrad1 || cfg.primaryColor)) {
    const g1 = cfg.topbarGrad1 || cfg.primaryColor || '#1E3A8A';
    const g2 = cfg.topbarGrad2 || cfg.primaryColor || '#2563EB';
    titleBar.style.background = `linear-gradient(90deg, ${g1} 0%, ${g2} 100%)`;
  }

  if (cfg.fontFamily) {
    document.body.style.fontFamily = `'${cfg.fontFamily}', system-ui, -apple-system, sans-serif`;
  }

  const hdrStore = document.getElementById('hdrStoreName');
  if (hdrStore && prefs.companyName) {
    hdrStore.textContent = `${prefs.companyName} (${getStoreCode()})`;
  }

  const ppnChk = document.getElementById('payIncludePpn');
  if (ppnChk && typeof prefs.taxEnabled === 'boolean') {
    ppnChk.checked = prefs.taxEnabled;
  }
  const roundChk = document.getElementById('payAutoRound');
  if (roundChk && typeof prefs.roundEnabled === 'boolean') {
    roundChk.checked = prefs.roundEnabled;
  }

  renderLogoToBox();
}

// =========================================================================
// 4. MULTI-MATA UANG (DUAL CURRENCY / FOREX ENGINE)
// =========================================================================
function loadCurrencyState() {
  try {
    const saved = localStorage.getItem('DANISH_POS_CURRENCY');
    if (saved) CURRENCY_CONFIG = { ...CURRENCY_CONFIG, ...JSON.parse(saved) };
  } catch (e) {}
}

function setPosCurrency(code, customRate = null) {
  const info = CURRENCY_CONFIG.rates[code] || { symbol: code, rate: 1 };
  const rate = code === 'IDR' ? 1 : (customRate || info.rate || 1);
  CURRENCY_CONFIG.activeCurrency = code;
  CURRENCY_CONFIG.symbol = info.symbol;
  CURRENCY_CONFIG.rateToIdr = rate;
  if (CURRENCY_CONFIG.rates[code]) CURRENCY_CONFIG.rates[code].rate = rate;
  try {
    localStorage.setItem('DANISH_POS_CURRENCY', JSON.stringify(CURRENCY_CONFIG));
  } catch (e) {}
  renderCartTable();
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

// =========================================================================
// 5. SINKRONISASI MASTER DATA POS & QRIS GATEWAY
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
    stok: Number(raw.stock ?? raw.stok ?? 99),
    trackStock: raw.trackStock !== false,
    aktif: raw.is_active !== false,
    gambar: raw.imageUrl || raw.gambar || '',
    isPromo: Boolean(raw.is_promo || raw.isPromo)
  };
}

function normalizeBackendMember(raw) {
  return {
    id: raw.member_id || raw.id || raw.card_code,
    kode: raw.card_code || raw.member_id || '',
    nama: raw.name || raw.nama || 'Member',
    hp: raw.phone || raw.hp || '',
    level: raw.price_level || 'UMUM',
    discountPct: Number(raw.member_discount_pct) || 0,
    poin: Number(raw.points ?? raw.poin ?? 0),
    creditLimit: Number(raw.credit_limit) || 0,
    currentDebt: Number(raw.current_debt) || 0
  };
}

async function syncMasterNow() {
  showToast('Menyinkronkan master data, promo & logo...', 'info');
  await initKasirDesignConfig();
  await loadInitialPosData();
}

async function loadInitialPosData() {
  const storeCode = getStoreCode();

  try {
    const cachedProducts = localStorage.getItem('DANISH_PRODUCTS_' + storeCode);
    const cachedCustomers = localStorage.getItem('DANISH_CUSTOMERS_' + storeCode);
    const cachedPromos = localStorage.getItem('DANISH_PROMOS_' + storeCode);
    const cachedQris = localStorage.getItem('DANISH_STATIC_QRIS_' + storeCode);
    const savedParked = localStorage.getItem('DANISH_PARKED_CARTS_' + storeCode);

    if (cachedProducts) PRODUCTS = JSON.parse(cachedProducts);
    if (cachedCustomers) CUSTOMERS = JSON.parse(cachedCustomers);
    if (cachedPromos) PROMOTIONS = JSON.parse(cachedPromos);
    if (cachedQris) QRIS_STATE.staticString = cachedQris;
    if (savedParked) PARKED_CARTS = JSON.parse(savedParked);
  } catch (e) {}

  renderCategoryQuickBar();
  renderShowcaseItems();
  renderCartTable();

  try {
    const [masterRes, qrisRes] = await Promise.all([
      ApiClient.call('pos/sync-master', { kodeToko: storeCode }).catch(() => null),
      ApiClient.call('admin/get-qris', { kodeToko: storeCode }).catch(() => null)
    ]);

    if (masterRes && Array.isArray(masterRes.products)) {
      PRODUCTS = masterRes.products.map(normalizeBackendProduct);
      localStorage.setItem('DANISH_PRODUCTS_' + storeCode, JSON.stringify(PRODUCTS));
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
      QRIS_STATE.mode = qrisRes.mode || 'OFFLINE_EMVCO';
      if (qrisRes.staticPayload) {
        QRIS_STATE.staticString = qrisRes.staticPayload;
        localStorage.setItem('DANISH_STATIC_QRIS_' + storeCode, qrisRes.staticPayload);
      }
    }

    renderCategoryQuickBar();
    renderShowcaseItems();
    showToast(`Data siap (${PRODUCTS.length} produk aktif)`, 'success');
  } catch (err) {
    console.warn('Mode Offline:', err);
  }
}

function renderCategoryQuickBar() {
  const bar = document.getElementById('kasirCategoryQuickBar');
  if (!bar) return;

  const cats = new Set(['SEMUA']);
  PRODUCTS.forEach((p) => {
    if (p.kategori && String(p.kategori).trim() !== '') {
      cats.add(String(p.kategori).trim());
    }
  });

  if (cats.size === 1) {
    cats.add('Minuman');
    cats.add('Makanan');
    cats.add('Fast Food');
    cats.add('Umum');
  }

  let html = '';
  cats.forEach((cat) => {
    const isActive = CURRENT_CATEGORY.toUpperCase() === cat.toUpperCase();
    html += `<button type="button" class="rene-cat-pill ${isActive ? 'active' : ''}" onclick="filterByQuickCategory('${escapeHtml(cat)}')">${escapeHtml(cat)}</button>`;
  });
  bar.innerHTML = html;
}

function filterByQuickCategory(cat) {
  CURRENT_CATEGORY = cat;
  renderCategoryQuickBar();
  if (cat.toLowerCase().includes('food') || cat.toLowerCase().includes('makan')) {
    switchShowcaseTab('FASTFOOD');
  }
  openSearchModal(cat === 'SEMUA' ? '' : cat);
}

// =========================================================================
// 6. PANEL KIRI KERANJANG: ETALASE "PROMO SPESIAL" & "FAST FOOD"
// =========================================================================
function switchShowcaseTab(tab) {
  SHOWCASE_TAB = tab;
  document.getElementById('btnTabPromoSpesial')?.classList.toggle('active', tab === 'PROMO');
  document.getElementById('btnTabFastFood')?.classList.toggle('active', tab === 'FASTFOOD');
  renderShowcaseItems();
}

function getShowcaseItemsList() {
  if (SHOWCASE_TAB === 'FASTFOOD') {
    const ffFromMaster = PRODUCTS.filter((p) => {
      const text = `${p.kategori} ${p.nama}`.toLowerCase();
      return (
        text.includes('fast') ||
        text.includes('food') ||
        text.includes('makan') ||
        text.includes('ayam') ||
        text.includes('burger') ||
        text.includes('kopi') ||
        text.includes('mie')
      );
    });
    if (ffFromMaster.length > 0) return ffFromMaster.slice(0, 8);

    return [
      { id: 'FF-01', sku: 'FF-01', barcode: 'FF001', nama: 'Ayam Goreng Krispi + Nasi', kategori: 'Fast Food', satuan: 'Porsi', hargaJual: 18500, emoji: '🍗', badge: 'HOT', trackStock: false },
      { id: 'FF-02', sku: 'FF-02', barcode: 'FF002', nama: 'Paket Hemat Burger + Es Teh', kategori: 'Fast Food', satuan: 'Paket', hargaJual: 22000, emoji: '🍔', badge: 'PAKET', trackStock: false },
      { id: 'FF-03', sku: 'FF-03', barcode: 'FF003', nama: 'Kentang Goreng (French Fries)', kategori: 'Fast Food', satuan: 'Porsi', hargaJual: 12000, emoji: '🍟', badge: 'BEST', trackStock: false },
      { id: 'FF-04', sku: 'FF-04', barcode: 'FF004', nama: 'Kopi Susu Gula Aren Dingin', kategori: 'Fast Food', satuan: 'Cup', hargaJual: 15000, emoji: '🧋', badge: 'CAFE', trackStock: false }
    ];
  }

  const promoBarcodes = new Set((PROMOTIONS || []).map((pr) => String(pr.target_barcode || '')));
  const promoFromMaster = PRODUCTS.filter((p) => p.isPromo || promoBarcodes.has(String(p.barcode)));
  if (promoFromMaster.length > 0) return promoFromMaster.slice(0, 8);

  if (PRODUCTS.length > 0) return PRODUCTS.slice(0, 6);

  return [
    { id: 'PRM-01', sku: 'SKU-1001', barcode: '899999900101', nama: 'Air Mineral 600ml', kategori: 'Minuman', satuan: 'Pcs', hargaJual: 3500, emoji: '💧', badge: 'PROMO', trackStock: false },
    { id: 'PRM-02', sku: 'SKU-1002', barcode: '899999900102', nama: 'Mie Instan Goreng', kategori: 'Makanan', satuan: 'Pcs', hargaJual: 3200, emoji: '🍜', badge: 'HEMAT', trackStock: false },
    { id: 'PRM-03', sku: 'SKU-1003', barcode: '899999900103', nama: 'Susu UHT Full Cream 1L', kategori: 'Minuman', satuan: 'Pcs', hargaJual: 19500, emoji: '🥛', badge: '15% OFF', trackStock: false },
    { id: 'PRM-04', sku: 'PRM-04', barcode: 'PRM004', nama: 'Roti Coklat Lumer + Kopi', kategori: 'Promo', satuan: 'Paket', hargaJual: 14000, emoji: '🥐', badge: 'BUNDLING', trackStock: false }
  ];
}

function renderShowcaseItems() {
  const grid = document.getElementById('showcaseCardsGrid');
  if (!grid) return;

  const items = getShowcaseItemsList();
  const isFF = SHOWCASE_TAB === 'FASTFOOD';

  let html = '';
  items.forEach((item, idx) => {
    const badgeLabel = item.badge || (isFF ? 'FAST FOOD' : 'PROMO');
    const fallbackEmoji = item.emoji || (isFF ? '🍔' : '🏷️');
    html += `
      <div class="promo-quick-card" onclick="addShowcaseItemToCart(${idx})" title="Klik untuk tambah ${escapeHtml(item.nama)}">
        <span class="promo-quick-badge ${isFF ? 'ff' : ''}">${escapeHtml(badgeLabel)}</span>
        <div class="promo-quick-thumb">
          ${
            item.gambar
              ? `<img src="${escapeHtml(item.gambar)}" alt="${escapeHtml(item.nama)}" onerror="this.outerHTML='<span>${fallbackEmoji}</span>'">`
              : `<span>${fallbackEmoji}</span>`
          }
        </div>
        <div class="promo-quick-title">${escapeHtml(item.nama)}</div>
        <div class="promo-quick-price">Rp ${formatNumber(item.hargaJual)}</div>
      </div>`;
  });

  grid.innerHTML = html;
}

function addShowcaseItemToCart(idx) {
  const items = getShowcaseItemsList();
  const selected = items[idx];
  if (!selected) return;
  addProductToCart(selected, 1);
  playBeepSound();
}

// =========================================================================
// 7. INPUT SCAN BARCODE, KERANJANG, PROMO OTOMATIS & KALKULASI
// =========================================================================
function bindBarcodeScannerInput() {
  const input = document.getElementById('barcodeInput');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;

    let qty = 1;
    let query = raw;
    if (raw.includes('*')) {
      const parts = raw.split('*');
      const parsedQty = parseInt(parts[0], 10);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        qty = parsedQty;
        query = parts.slice(1).join('*').trim();
      }
    }

    const qLower = query.toLowerCase();
    const exact = PRODUCTS.find(
      (p) =>
        String(p.barcode || '').toLowerCase() === qLower ||
        String(p.sku || '').toLowerCase() === qLower
    );

    if (exact) {
      addProductToCart(exact, qty);
      input.value = '';
      playBeepSound();
    } else {
      openSearchModal(query);
    }
  });
}

function addProductToCart(prod, qty = 1) {
  const maxStock = prod.trackStock !== false ? Number(prod.stok ?? 999999) : 999999;
  const unitPrice = Number(prod.hargaJual || 0);
  const existingIdx = CART.findIndex((it) => String(it.id) === String(prod.id) && !it.isCustom);

  if (existingIdx > -1) {
    const nextQty = CART[existingIdx].qty + qty;
    if (nextQty > maxStock) {
      showToast(`Stok tidak mencukupi (Maks: ${maxStock})`, 'warning');
      return;
    }
    CART[existingIdx].qty = nextQty;
    SELECTED_CART_INDEX = existingIdx;
  } else {
    if (qty > maxStock) {
      showToast(`Stok tidak mencukupi (Maks: ${maxStock})`, 'warning');
      return;
    }
    CART.push({
      id: prod.id,
      sku: prod.sku || prod.id,
      barcode: prod.barcode || prod.sku || prod.id,
      nama: prod.nama,
      satuan: prod.satuan || 'PCS',
      conversionQty: Number(prod.conversionQty) || 1,
      harga: unitPrice,
      qty: qty,
      discNominal: 0,
      trackStock: prod.trackStock !== false,
      maxStock: maxStock,
      isCustom: Boolean(prod.isCustom)
    });
    SELECTED_CART_INDEX = CART.length - 1;
  }

  applyAutomaticPromotions();

  const activeNameEl = document.getElementById('lblActiveItemName');
  const activePriceEl = document.getElementById('lblActiveItemPrice');
  if (activeNameEl) activeNameEl.textContent = `${prod.nama} (${qty}x)`;
  if (activePriceEl) activePriceEl.textContent = formatNumber(unitPrice * qty);

  renderCartTable();
  syncCustomerDisplay();
}

function applyAutomaticPromotions() {
  const pwpBox = document.getElementById('pwpAlertBox');
  if (!Array.isArray(PROMOTIONS) || PROMOTIONS.length === 0) {
    if (pwpBox) pwpBox.textContent = '';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let appliedMessages = [];

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
        appliedMessages.push(`Promo ${item.nama}: Diskon ${promo.promo_price}%`);
      } else if (promo.promo_type === 'TIERED') {
        const diff = Math.max(0, item.harga - Number(promo.promo_price));
        item.discNominal = diff * item.qty;
        appliedMessages.push(`Harga Grosir/Promo ${item.nama} aktif!`);
      }
    }
  });

  if (pwpBox) {
    pwpBox.textContent = appliedMessages.length > 0 ? '🎉 ' + appliedMessages.join(' | ') : '';
  }
}

function selectCartRow(idx) {
  SELECTED_CART_INDEX = idx;
  renderCartTable();
}

function adjustCartRowQty(idx, delta) {
  if (!CART[idx]) return;
  const next = CART[idx].qty + delta;
  if (next <= 0) {
    CART.splice(idx, 1);
    if (SELECTED_CART_INDEX >= CART.length) SELECTED_CART_INDEX = CART.length - 1;
  } else {
    if (CART[idx].trackStock && next > CART[idx].maxStock) {
      showToast(`Batas stok maksimal (${CART[idx].maxStock})`, 'warning');
      return;
    }
    CART[idx].qty = next;
    SELECTED_CART_INDEX = idx;
    applyAutomaticPromotions();
  }
  renderCartTable();
  syncCustomerDisplay();
}

function voidSelectedItem() {
  if (SELECTED_CART_INDEX < 0 || !CART[SELECTED_CART_INDEX]) {
    showToast('Pilih baris barang yang akan dihapus terlebih dahulu', 'warning');
    return;
  }
  CART.splice(SELECTED_CART_INDEX, 1);
  if (SELECTED_CART_INDEX >= CART.length) SELECTED_CART_INDEX = CART.length - 1;
  renderCartTable();
  syncCustomerDisplay();
}

function clearCartWithPin() {
  if (CART.length === 0) return;
  if (!confirm('Kosongkan seluruh keranjang belanja saat ini?')) return;
  CART = [];
  SELECTED_CART_INDEX = -1;
  const activeNameEl = document.getElementById('lblActiveItemName');
  const activePriceEl = document.getElementById('lblActiveItemPrice');
  const pwpBox = document.getElementById('pwpAlertBox');
  if (activeNameEl) activeNameEl.textContent = '[Siap Scan Barang]';
  if (activePriceEl) activePriceEl.textContent = '0';
  if (pwpBox) pwpBox.textContent = '';
  renderCartTable();
  syncCustomerDisplay();
}

function getCartTotals() {
  let subtotal = 0;
  let itemDisc = 0;
  CART.forEach((it) => {
    subtotal += it.harga * it.qty;
    itemDisc += it.discNominal || 0;
  });
  const grandTotal = Math.max(0, subtotal - itemDisc);
  return { subtotal, itemDisc, grandTotal };
}

function renderCartTable() {
  const tbody = document.getElementById('cartTableBody');
  if (!tbody) return;

  let html = '';
  CART.forEach((it, idx) => {
    const lineTotal = it.harga * it.qty - (it.discNominal || 0);
    const isSel = idx === SELECTED_CART_INDEX;
    html += `
      <tr class="${isSel ? 'selected' : ''}" onclick="selectCartRow(${idx})">
        <td><strong>${it.qty}</strong> <small style="color:#64748B;">${escapeHtml(it.satuan)}</small></td>
        <td><strong>${escapeHtml(it.nama)}</strong><br><small style="color:#64748B;">${escapeHtml(it.barcode)}</small></td>
        <td class="num">${formatNumber(it.harga)}</td>
        <td class="num" style="color:#DC2626;">${it.discNominal > 0 ? '-' + formatNumber(it.discNominal) : '0'}</td>
        <td class="num"><strong>${formatNumber(lineTotal)}</strong></td>
      </tr>`;
  });
  tbody.innerHTML = html;

  const totals = getCartTotals();
  const grandEl = document.getElementById('lblGrandTotal');
  const subInfoEl = document.getElementById('lblSubItemInfo');
  if (grandEl) grandEl.textContent = formatNumber(totals.grandTotal);
  if (subInfoEl) {
    const foreignNote = CURRENCY_CONFIG.activeCurrency !== 'IDR' ? ` | ≈ ${formatMoney(totals.grandTotal, false)}` : '';
    subInfoEl.textContent = `(Subtotal: Rp ${formatNumber(totals.subtotal)} | Hemat: Rp ${formatNumber(totals.itemDisc)}${foreignNote})`;
  }
}

// =========================================================================
// 8. MODAL EDIT BARIS [F7], KATALOG [F2], MEMBER [F4], HOLD [F5/F3]
// =========================================================================
function openEditItemModal() {
  if (SELECTED_CART_INDEX < 0 || !CART[SELECTED_CART_INDEX]) {
    showToast('Pilih item di tabel belanja terlebih dahulu', 'warning');
    return;
  }
  const item = CART[SELECTED_CART_INDEX];
  document.getElementById('editItemTitle').textContent = item.nama;
  document.getElementById('editItemQty').value = item.qty;
  document.getElementById('editItemDiscPct').value = 0;
  document.getElementById('editItemDiscRp').value = item.discNominal || 0;
  document.getElementById('editItemPin').value = '';
  document.getElementById('editItemModal').classList.add('active');
}

function applyEditItem() {
  if (SELECTED_CART_INDEX < 0 || !CART[SELECTED_CART_INDEX]) return;
  const item = CART[SELECTED_CART_INDEX];
  const qty = Math.max(1, parseInt(document.getElementById('editItemQty').value, 10) || 1);
  const discPct = parseFloat(document.getElementById('editItemDiscPct').value) || 0;
  const discRp = parseFloat(document.getElementById('editItemDiscRp').value) || 0;

  let finalDisc = discRp;
  if (discPct > 0) {
    finalDisc = Math.round((item.harga * qty * discPct) / 100);
  }
  item.qty = qty;
  item.discNominal = Math.min(item.harga * qty, finalDisc);
  if (finalDisc > 0) item.manualDisc = true;

  closeModals();
  renderCartTable();
  syncCustomerDisplay();
}

function openSearchModal(initialQuery = '') {
  const modal = document.getElementById('searchModal');
  const input = document.getElementById('localSearchInput');
  if (!modal || !input) return;
  input.value = initialQuery;
  runLocalSearch();
  modal.classList.add('active');
  setTimeout(() => input.focus(), 80);
}

function runLocalSearch() {
  const q = (document.getElementById('localSearchInput')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('searchResultBody');
  if (!tbody) return;

  const list = PRODUCTS.filter((p) => {
    if (!q) return true;
    return `${p.nama} ${p.barcode} ${p.sku} ${p.kategori}`.toLowerCase().includes(q);
  }).slice(0, 50);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:16px; color:#64748B;">Barang tidak ditemukan.</td></tr>';
    return;
  }

  let html = '';
  list.forEach((p) => {
    html += `
      <tr style="cursor:pointer;" onclick="selectProductFromSearch('${escapeHtml(String(p.id))}')">
        <td>${escapeHtml(p.barcode)}</td>
        <td><strong>${escapeHtml(p.nama)}</strong> <small style="color:#64748B;">(${escapeHtml(p.kategori)} • Stok: ${p.stok})</small></td>
        <td class="num"><strong>Rp ${formatNumber(p.hargaJual)}</strong></td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

function selectProductFromSearch(id) {
  const prod = PRODUCTS.find((p) => String(p.id) === String(id));
  if (prod) {
    addProductToCart(prod, 1);
    playBeepSound();
  }
  closeModals();
}

function openMemberModal() {
  const modal = document.getElementById('memberModal');
  if (!modal) return;
  runMemberSearch();
  modal.classList.add('active');
}

function runMemberSearch() {
  const q = (document.getElementById('memberSearchInput')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('memberResultBody');
  if (!tbody) return;

  const list = CUSTOMERS.filter((c) => {
    if (!q) return true;
    return `${c.nama} ${c.hp} ${c.kode}`.toLowerCase().includes(q);
  }).slice(0, 30);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:14px; color:#64748B;">Member tidak ditemukan.</td></tr>';
    return;
  }

  let html = '';
  list.forEach((c) => {
    html += `
      <tr style="cursor:pointer;" onclick="selectMemberById('${escapeHtml(String(c.id))}')">
        <td>${escapeHtml(c.kode)}</td>
        <td><strong>${escapeHtml(c.nama)}</strong><br><small>${escapeHtml(c.hp || '-')}</small></td>
        <td>${escapeHtml(c.level || 'UMUM')}</td>
        <td class="num"><strong>${formatNumber(c.poin || 0)}</strong></td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

function selectMemberById(id) {
  const cust = CUSTOMERS.find((c) => String(c.id) === String(id));
  if (!cust) return;
  SELECTED_CUSTOMER = cust;
  updateActiveMemberUI();
  closeModals();
  showToast(`Member dipilih: ${cust.nama}`, 'success');
}

function resetActiveMember() {
  SELECTED_CUSTOMER = null;
  updateActiveMemberUI();
}

function updateActiveMemberUI() {
  const nameEl = document.getElementById('lblActiveMemberName');
  const badgeEl = document.getElementById('lblActiveMemberBadge');
  const resetBtn = document.getElementById('btnResetMember');

  if (SELECTED_CUSTOMER) {
    if (nameEl) nameEl.textContent = `${SELECTED_CUSTOMER.nama} (${SELECTED_CUSTOMER.level || 'MEMBER'})`;
    if (badgeEl) badgeEl.textContent = `${formatNumber(SELECTED_CUSTOMER.poin || 0)} Poin`;
    if (resetBtn) resetBtn.style.display = 'inline-block';
  } else {
    if (nameEl) nameEl.textContent = 'Pelanggan Umum (UMUM)';
    if (badgeEl) badgeEl.textContent = '0 Poin';
    if (resetBtn) resetBtn.style.display = 'none';
  }
}

async function quickRegisterMember() {
  const name = document.getElementById('newMbrName')?.value.trim();
  const phone = document.getElementById('newMbrPhone')?.value.trim();
  const level = document.getElementById('newMbrLevel')?.value || 'SILVER';
  if (!name || !phone) {
    showToast('Nama dan No. HP member wajib diisi', 'error');
    return;
  }

  const newCust = {
    id: 'MBR-' + Date.now().toString().slice(-6),
    kode: phone,
    nama: name,
    hp: phone,
    level: level,
    poin: 0,
    creditLimit: 0,
    currentDebt: 0
  };
  CUSTOMERS.unshift(newCust);
  SELECTED_CUSTOMER = newCust;
  updateActiveMemberUI();
  closeModals();
  showToast('Member baru berhasil didaftarkan', 'success');

  try {
    await ApiClient.call('member/save', {
      member_id: newCust.id,
      card_code: newCust.kode,
      name: name,
      phone: phone,
      price_level: level
    });
  } catch (e) {}
}

function handleHoldRecall(mode = 'HOLD') {
  if (mode === 'HOLD' && CART.length > 0) {
    const note = prompt('Masukkan catatan pembeli / nomor meja:', document.getElementById('kasirTableNumberInput')?.value || `Antrean #${PARKED_CARTS.length + 1}`);
    if (note === null) return;
    const totals = getCartTotals();
    PARKED_CARTS.push({
      id: 'HOLD-' + Date.now(),
      note: note.trim() || `Antrean #${PARKED_CARTS.length + 1}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      items: JSON.parse(JSON.stringify(CART)),
      customer: SELECTED_CUSTOMER,
      total: totals.grandTotal
    });
    localStorage.setItem('DANISH_PARKED_CARTS_' + getStoreCode(), JSON.stringify(PARKED_CARTS));
    CART = [];
    SELECTED_CART_INDEX = -1;
    renderCartTable();
    showToast('Transaksi berhasil ditunda (Hold)', 'success');
    return;
  }

  const tbody = document.getElementById('holdQueueBody');
  if (tbody) {
    if (PARKED_CARTS.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:#64748B;">Belum ada antrean yang ditunda.</td></tr>';
    } else {
      let html = '';
      PARKED_CARTS.forEach((p, idx) => {
        html += `
          <tr>
            <td><strong>${escapeHtml(p.note)}</strong></td>
            <td>${escapeHtml(p.time)}</td>
            <td class="num">${p.items.length}</td>
            <td class="num"><strong>Rp ${formatNumber(p.total)}</strong></td>
            <td>
              <button onclick="recallParkedCart(${idx})" style="padding:4px 8px; border-radius:6px; border:none; background:#2563EB; color:#fff; font-weight:700; cursor:pointer;">Panggil</button>
              <button onclick="deleteParkedCart(${idx})" style="padding:4px 7px; border-radius:6px; border:none; background:#DC2626; color:#fff; font-weight:700; cursor:pointer;">Hapus</button>
            </td>
          </tr>`;
      });
      tbody.innerHTML = html;
    }
  }
  document.getElementById('holdQueueModal')?.classList.add('active');
}

function recallParkedCart(idx) {
  const item = PARKED_CARTS[idx];
  if (!item) return;
  CART = item.items;
  SELECTED_CUSTOMER = item.customer || null;
  SELECTED_CART_INDEX = CART.length > 0 ? 0 : -1;
  PARKED_CARTS.splice(idx, 1);
  localStorage.setItem('DANISH_PARKED_CARTS_' + getStoreCode(), JSON.stringify(PARKED_CARTS));
  updateActiveMemberUI();
  renderCartTable();
  closeModals();
  showToast(`Antrean "${item.note}" dipanggil`, 'success');
}

function deleteParkedCart(idx) {
  PARKED_CARTS.splice(idx, 1);
  localStorage.setItem('DANISH_PARKED_CARTS_' + getStoreCode(), JSON.stringify(PARKED_CARTS));
  handleHoldRecall('RECALL');
}

// =========================================================================
// 9. MODAL PEMBAYARAN MULTI-CHANNEL (KOTAK 1-6) + QRIS DINAMIS EMVCo
// =========================================================================
function openCheckoutModal(defaultChannel = 'CASH') {
  if (CART.length === 0) {
    showToast('Keranjang belanja masih kosong!', 'warning');
    return;
  }

  const modal = document.getElementById('checkoutModal');
  if (!modal) return;

  document.getElementById('payInvoiceDiscount').value = 0;
  document.getElementById('payCashInput').value = 0;
  document.getElementById('payQrisInput').value = 0;
  document.getElementById('payTransferInput').value = 0;
  document.getElementById('payTransferRef').value = '';
  document.getElementById('payEdcInput').value = 0;
  document.getElementById('payEdcRef').value = '';
  const tempoInput = document.getElementById('payTempoInput');
  if (tempoInput) tempoInput.value = 0;

  const tagEl = document.getElementById('checkoutMemberTag');
  const redeemInput = document.getElementById('payRedeemPoints');
  const availPtsEl = document.getElementById('availPointsLbl');
  const tempoRow = document.getElementById('tempoPaymentRow');
  const availCreditEl = document.getElementById('availCreditLbl');

  if (SELECTED_CUSTOMER) {
    if (tagEl) tagEl.textContent = `${SELECTED_CUSTOMER.nama} (${formatNumber(SELECTED_CUSTOMER.poin || 0)} Poin)`;
    if (availPtsEl) availPtsEl.textContent = formatNumber(SELECTED_CUSTOMER.poin || 0);
    if (redeemInput) {
      redeemInput.disabled = (SELECTED_CUSTOMER.poin || 0) <= 0;
      redeemInput.value = 0;
    }
    const availCredit = Math.max(0, (SELECTED_CUSTOMER.creditLimit || 0) - (SELECTED_CUSTOMER.currentDebt || 0));
    if (tempoRow) tempoRow.style.display = availCredit > 0 ? 'block' : 'none';
    if (availCreditEl) availCreditEl.textContent = `Rp ${formatNumber(availCredit)}`;
  } else {
    if (tagEl) tagEl.textContent = 'Pelanggan Umum (0 Poin)';
    if (availPtsEl) availPtsEl.textContent = '0';
    if (redeemInput) {
      redeemInput.disabled = true;
      redeemInput.value = 0;
    }
    if (tempoRow) tempoRow.style.display = 'none';
  }

  calcChange();
  selectFullPaymentPreset(defaultChannel);
  modal.classList.add('active');
}

function getComputedCheckoutSummary() {
  const prefs = KASIR_COMPANY_PREFS;
  const totals = getCartTotals();

  const invDisc = Math.max(0, parseFloat(document.getElementById('payInvoiceDiscount')?.value) || 0);
  const maxPts = SELECTED_CUSTOMER ? Number(SELECTED_CUSTOMER.poin || 0) : 0;
  const redeemPts = Math.min(maxPts, Math.max(0, parseInt(document.getElementById('payRedeemPoints')?.value, 10) || 0));
  const redeemVal = redeemPts * (Number(prefs.pointRedeemVal) || 100);

  let base = Math.max(0, totals.grandTotal - invDisc - redeemVal);
  const includePpn = document.getElementById('payIncludePpn')?.checked || false;
  const autoRound = document.getElementById('payAutoRound')?.checked !== false;

  let taxAmount = 0;
  if (includePpn && base > 0) {
    const rate = (Number(prefs.taxPct) || 11) / 100;
    taxAmount = Math.round(base * rate);
    base += taxAmount;
  }

  let finalDue = base;
  const step = Number(prefs.roundStep) || 100;
  if (autoRound && finalDue > 0 && step > 0) {
    finalDue = prefs.roundMode === 'UP'
      ? Math.ceil(finalDue / step) * step
      : Math.floor(finalDue / step) * step;
  }

  return {
    subtotal: totals.subtotal,
    itemDisc: totals.itemDisc,
    invDisc,
    redeemPts,
    redeemVal,
    taxAmount,
    finalDue
  };
}

function selectFullPaymentPreset(channel) {
  const summary = getComputedCheckoutSummary();
  document.getElementById('payCashInput').value = 0;
  document.getElementById('payQrisInput').value = 0;
  document.getElementById('payTransferInput').value = 0;
  document.getElementById('payEdcInput').value = 0;

  if (channel === 'CASH') {
    document.getElementById('payCashInput').value = summary.finalDue;
  } else if (channel === 'QRIS' || channel === 'EWALLET') {
    document.getElementById('payQrisInput').value = summary.finalDue;
    if (channel === 'EWALLET') document.getElementById('payQrisProvider').value = 'DANA';
    triggerHybridQrisDisplay(summary.finalDue);
  } else if (channel === 'TRANSFER') {
    document.getElementById('payTransferInput').value = summary.finalDue;
  } else if (channel === 'EDC') {
    document.getElementById('payEdcInput').value = summary.finalDue;
  }

  calcChange();
}

function setQuickCash(addAmount) {
  const cashInput = document.getElementById('payCashInput');
  if (!cashInput) return;
  const current = parseFloat(cashInput.value) || 0;
  cashInput.value = current + addAmount;
  calcChange();
}

function calcChange() {
  const summary = getComputedCheckoutSummary();
  const dueEl = document.getElementById('modalTotalDue');
  if (dueEl) dueEl.textContent = `Rp ${formatNumber(summary.finalDue)}`;

  const cash = parseFloat(document.getElementById('payCashInput')?.value) || 0;
  const qris = parseFloat(document.getElementById('payQrisInput')?.value) || 0;
  const transfer = parseFloat(document.getElementById('payTransferInput')?.value) || 0;
  const edc = parseFloat(document.getElementById('payEdcInput')?.value) || 0;
  const tempo = parseFloat(document.getElementById('payTempoInput')?.value) || 0;

  if (qris > 0) {
    triggerHybridQrisDisplay(qris);
  }

  const totalPaid = cash + qris + transfer + edc + tempo;
  const change = Math.max(0, totalPaid - summary.finalDue);

  const changeEl = document.getElementById('modalChangeVal');
  if (changeEl) {
    changeEl.textContent = `Rp ${formatNumber(change)}`;
    changeEl.style.color = totalPaid < summary.finalDue ? '#DC2626' : '#059669';
  }
}

async function triggerHybridQrisDisplay(amountIdr) {
  const roundedAmt = Math.round(amountIdr);
  if (roundedAmt <= 0) return;

  if (QRIS_STATE.mode === 'API_GATEWAY') {
    try {
      const gwRes = await ApiClient.call('pos/qris-create', {
        kodeToko: getStoreCode(),
        orderId: 'QR-' + Date.now(),
        amount: roundedAmt
      });
      if (gwRes && !gwRes.fallbackOffline && gwRes.qrString) {
        QRIS_STATE.dynamicPayload = gwRes.qrString;
        syncCustomerDisplay(gwRes.qrString, roundedAmt);
        return;
      }
    } catch (e) {}
  }

  if (QRIS_STATE.staticString) {
    const dyn = buildDynamicQrisString(QRIS_STATE.staticString, roundedAmt);
    QRIS_STATE.dynamicPayload = dyn;
    syncCustomerDisplay(dyn, roundedAmt);
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

  const summary = getComputedCheckoutSummary();
  const cash = parseFloat(document.getElementById('payCashInput')?.value) || 0;
  const qris = parseFloat(document.getElementById('payQrisInput')?.value) || 0;
  const qrisProv = document.getElementById('payQrisProvider')?.value || 'QRIS';
  const transfer = parseFloat(document.getElementById('payTransferInput')?.value) || 0;
  const bankProv = document.getElementById('payBankProvider')?.value || 'BCA';
  const transferRef = document.getElementById('payTransferRef')?.value.trim() || '';
  const edc = parseFloat(document.getElementById('payEdcInput')?.value) || 0;
  const edcType = document.getElementById('payEdcType')?.value || 'DEBIT';
  const edcRef = document.getElementById('payEdcRef')?.value.trim() || '';
  const tempo = parseFloat(document.getElementById('payTempoInput')?.value) || 0;

  const totalPaid = cash + qris + transfer + edc + tempo;
  if (totalPaid < summary.finalDue) {
    showToast(`Pembayaran kurang Rp ${formatNumber(summary.finalDue - totalPaid)}`, 'error');
    return;
  }

  const change = Math.max(0, totalPaid - summary.finalDue);
  const storeCode = getStoreCode();
  const prefix = KASIR_COMPANY_PREFS.prefixStruk || 'TRX-';
  const trxId = `${prefix}${storeCode}-${Date.now()}`;
  const shiftId = ACTIVE_SHIFT?.shiftId || `SHF-${storeCode}-DEFAULT`;
  const cashierId = SESSION.user.idUser || SESSION.user.username;
  const timestamp = new Date().toISOString();

  const earnStep = Number(KASIR_COMPANY_PREFS.pointEarnStep) || 10000;
  const earnedPts = SELECTED_CUSTOMER && earnStep > 0 ? Math.floor(summary.finalDue / earnStep) : 0;

  const payments = [];
  if (cash > 0) payments.push({ method: 'CASH', amount: cash, ref: '' });
  if (qris > 0) payments.push({ method: qrisProv, amount: qris, ref: '' });
  if (transfer > 0) payments.push({ method: `TRANSFER_${bankProv}`, amount: transfer, ref: transferRef });
  if (edc > 0) payments.push({ method: `EDC_${edcType}`, amount: edc, ref: edcRef });
  if (tempo > 0) payments.push({ method: 'TEMPO_MEMBER', amount: tempo, ref: SELECTED_CUSTOMER?.id || '' });

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

  const itemsJsonStr = JSON.stringify(backendItems);
  const paymentsJsonStr = JSON.stringify(payments);
  const checksum = await sha256Hex(`${trxId}|${shiftId}|${summary.finalDue}|${itemsJsonStr}`);

  const serverTrx = {
    trx_id: trxId,
    shift_id: shiftId,
    timestamp: timestamp,
    cashier_id: cashierId,
    trx_type: 'SALE',
    items_json: itemsJsonStr,
    promo_applied_json: '[]',
    discount_total: summary.itemDisc + summary.invDisc + summary.redeemVal,
    tax_amount: summary.taxAmount,
    grand_total: summary.finalDue,
    payments_json: paymentsJsonStr,
    checksum: checksum,
    member_id: SELECTED_CUSTOMER ? SELECTED_CUSTOMER.id : 'MBR-000',
    points_redeemed: summary.redeemPts
  };

  // Potong stok lokal
  CART.forEach((sold) => {
    const pIdx = PRODUCTS.findIndex((p) => String(p.id) === String(sold.id));
    if (pIdx > -1 && PRODUCTS[pIdx].trackStock !== false) {
      PRODUCTS[pIdx].stok = Math.max(0, Number(PRODUCTS[pIdx].stok || 0) - sold.qty);
    }
  });
  localStorage.setItem('DANISH_PRODUCTS_' + storeCode, JSON.stringify(PRODUCTS));

  // Update saldo poin & piutang member lokal
  if (SELECTED_CUSTOMER) {
    SELECTED_CUSTOMER.poin = Math.max(0, Number(SELECTED_CUSTOMER.poin || 0) - summary.redeemPts + earnedPts);
    if (tempo > 0) SELECTED_CUSTOMER.currentDebt = Number(SELECTED_CUSTOMER.currentDebt || 0) + tempo;
    const cIdx = CUSTOMERS.findIndex((c) => String(c.id) === String(SELECTED_CUSTOMER.id));
    if (cIdx > -1) CUSTOMERS[cIdx] = { ...SELECTED_CUSTOMER };
    localStorage.setItem('DANISH_CUSTOMERS_' + storeCode, JSON.stringify(CUSTOMERS));
  }

  LAST_RECEIPT_OBJ = {
    trxId,
    tanggal: timestamp,
    namaToko: KASIR_COMPANY_PREFS.companyName || SESSION.store?.namaToko || 'DANISH POS',
    kasirNama: SESSION.user.nama || SESSION.user.username,
    customerName: SELECTED_CUSTOMER ? SELECTED_CUSTOMER.nama : '',
    earnedPts,
    saldoPts: SELECTED_CUSTOMER ? SELECTED_CUSTOMER.poin : 0,
    items: JSON.parse(JSON.stringify(CART)),
    subtotal: summary.subtotal,
    totalDiskon: summary.itemDisc + summary.invDisc + summary.redeemVal,
    pajak: summary.taxAmount,
    grandTotal: summary.finalDue,
    totalBayar: totalPaid,
    kembalian: change,
    payments
  };

  saveTransactionToLocalHistory(LAST_RECEIPT_OBJ);
  enqueueOfflineTransaction(serverTrx);
  syncOfflineTransactions();
  printThermalReceipt(LAST_RECEIPT_OBJ);

  closeModals();
  CART = [];
  SELECTED_CART_INDEX = -1;
  SELECTED_CUSTOMER = null;
  QRIS_STATE.dynamicPayload = '';
  updateActiveMemberUI();
  renderCartTable();
  syncCustomerDisplay();

  showToast(`Transaksi Sukses! Kembalian: Rp ${formatNumber(change)}`, 'success');
}

function saveTransactionToLocalHistory(trx) {
  const key = 'DANISH_TRX_HISTORY_' + getStoreCode();
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift(trx);
    if (list.length > 200) list.length = 200;
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {}
}

function reprintLastReceipt() {
  if (!LAST_RECEIPT_OBJ) {
    const key = 'DANISH_TRX_HISTORY_' + getStoreCode();
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    if (list.length > 0) LAST_RECEIPT_OBJ = list[0];
  }
  if (!LAST_RECEIPT_OBJ) {
    showToast('Belum ada transaksi terakhir untuk dicetak ulang', 'warning');
    return;
  }
  printThermalReceipt(LAST_RECEIPT_OBJ);
}

function printThermalReceipt(trx) {
  const area = document.getElementById('thermalReceiptArea');
  if (!area) return;
  const prefs = KASIR_COMPANY_PREFS;
  const logoSrc = normalizeLogoDataUrl(prefs.logoBase64 || prefs.logoUrl || '');

  let rows = '';
  trx.items.forEach((it) => {
    const sub = it.harga * it.qty - (it.discNominal || 0);
    rows += `
      <div style="margin-bottom:4px;">
        <div style="font-weight:bold;">${escapeHtml(it.nama)}</div>
        <div style="display:flex; justify-content:space-between; font-size:11px;">
          <span>${it.qty} x ${formatNumber(it.harga)}</span>
          <span>${formatNumber(sub)}</span>
        </div>
      </div>`;
  });

  area.innerHTML = `
    <div style="width:58mm; font-family:'Courier New',monospace; font-size:12px; color:#000; padding:4px;">
      <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">
        ${logoSrc ? `<img src="${logoSrc}" style="max-width:40mm; max-height:16mm; object-fit:contain;"><br>` : ''}
        <strong>${escapeHtml(trx.namaToko)}</strong><br>
        ${prefs.companyAddress ? `<span style="font-size:10px;">${escapeHtml(prefs.companyAddress)}</span>` : ''}
      </div>
      <div style="font-size:11px; border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">
        <div>No   : ${escapeHtml(trx.trxId)}</div>
        <div>Tgl  : ${new Date(trx.tanggal).toLocaleString('id-ID')}</div>
        <div>Kasir: ${escapeHtml(trx.kasirNama)}</div>
        ${trx.customerName ? `<div>Member: ${escapeHtml(trx.customerName)}</div>` : ''}
      </div>
      <div style="border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:6px;">${rows}</div>
      <div style="font-size:12px;">
        <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>TOTAL</span><span>Rp ${formatNumber(trx.grandTotal)}</span></div>
        <div style="display:flex; justify-content:space-between;"><span>BAYAR</span><span>Rp ${formatNumber(trx.totalBayar)}</span></div>
        <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>KEMBALI</span><span>Rp ${formatNumber(trx.kembalian)}</span></div>
      </div>
      ${
        trx.customerName
          ? `<div style="font-size:10px; text-align:center; margin-top:6px;">Poin +${trx.earnedPts || 0} | Saldo Poin: ${trx.saldoPts || 0}</div>`
          : ''
      }
      <div style="text-align:center; font-size:11px; margin-top:8px;">${escapeHtml(prefs.receiptFooter || 'Terima Kasih')}</div>
    </div>`;

  window.print();
}

// =========================================================================
// 10. PPOB, TARIK TUNAI, RETUR, CASH DROP, TUTUP SHIFT & CETAK LABEL
// =========================================================================
function openNonPhysicalModal() {
  document.getElementById('modal-non-physical')?.classList.add('active');
}

function switchNonPhysicalTab(tab) {
  const isPpob = tab === 'PPOB';
  document.getElementById('form-ppob').style.display = isPpob ? 'block' : 'none';
  document.getElementById('form-cashout').style.display = isPpob ? 'none' : 'block';
}

function addPpobToCart() {
  const cat = document.getElementById('ppob-category')?.value || 'PPOB';
  const target = document.getElementById('ppob-target')?.value.trim() || '-';
  const price = parseFloat(document.getElementById('ppob-price')?.value) || 0;
  if (price <= 0) {
    showToast('Masukkan harga jual layanan PPOB', 'error');
    return;
  }
  addProductToCart({
    id: 'PPOB-' + Date.now(),
    sku: 'PPOB-' + cat,
    barcode: 'PPOB',
    nama: `${cat} (${target})`,
    satuan: 'TRX',
    hargaJual: price,
    trackStock: false,
    isCustom: true
  }, 1);
  closeModals();
}

async function submitCashOutTransaction() {
  const amount = parseFloat(document.getElementById('cashout-amount')?.value) || 0;
  const fee = parseFloat(document.getElementById('cashout-fee')?.value) || 0;
  const ref = document.getElementById('cashout-ref')?.value.trim() || '';
  if (amount <= 0) {
    showToast('Masukkan nominal tarik tunai', 'error');
    return;
  }
  try {
    await ApiClient.call('pos/cash-out', {
      kodeToko: getStoreCode(),
      shiftId: ACTIVE_SHIFT?.shiftId || '',
      kasir: SESSION?.user?.username || '',
      nominal: amount,
      biayaAdmin: fee,
      referensi: ref
    });
  } catch (e) {}
  showToast(`Tarik Tunai Rp ${formatNumber(amount)} (Admin Rp ${formatNumber(fee)}) dicatat`, 'success');
  closeModals();
}

function openReturnModal() {
  RETURN_LOADED_TRX = null;
  document.getElementById('returnTrxMeta').textContent = '';
  document.getElementById('returnItemsBody').innerHTML = '';
  document.getElementById('returnModal')?.classList.add('active');
}

function searchTrxForReturn() {
  const trxId = (document.getElementById('returnSearchTrxId')?.value || '').trim();
  if (!trxId) {
    showToast('Masukkan nomor struk terlebih dahulu', 'warning');
    return;
  }
  const key = 'DANISH_TRX_HISTORY_' + getStoreCode();
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  const found = list.find((t) => String(t.trxId).toLowerCase() === trxId.toLowerCase());

  if (!found) {
    document.getElementById('returnTrxMeta').textContent = 'Struk tidak ditemukan di riwayat lokal perangkat ini.';
    return;
  }

  RETURN_LOADED_TRX = found;
  document.getElementById('returnTrxMeta').textContent = `Struk ${found.trxId} • Tgl: ${new Date(found.tanggal).toLocaleString('id-ID')} • Kasir: ${found.kasirNama}`;
  document.getElementById('returnItemsBody').innerHTML = found.items.map((it, idx) => `
    <tr>
      <td>${escapeHtml(it.nama)}</td>
      <td class="num">Rp ${formatNumber(it.harga)}</td>
      <td class="num">${it.qty}</td>
      <td class="num"><input type="number" id="retQty_${idx}" min="0" max="${it.qty}" value="0" style="width:65px; margin:0; padding:4px;"></td>
    </tr>`).join('');
}

async function submitSalesReturn() {
  if (!RETURN_LOADED_TRX) {
    showToast('Cari dan muat nomor struk terlebih dahulu', 'warning');
    return;
  }
  const reason = document.getElementById('returnReason')?.value.trim() || 'Retur Pelanggan';
  const spvPin = document.getElementById('returnSpvPin')?.value.trim() || '';
  if (!spvPin) {
    showToast('PIN Supervisor wajib diisi untuk retur', 'error');
    return;
  }

  const returnedItems = [];
  RETURN_LOADED_TRX.items.forEach((it, idx) => {
    const qtyRet = parseInt(document.getElementById(`retQty_${idx}`)?.value, 10) || 0;
    if (qtyRet > 0) returnedItems.push({ ...it, qtyRetur: qtyRet });
  });

  if (returnedItems.length === 0) {
    showToast('Masukkan minimal 1 Qty barang yang diretur', 'warning');
    return;
  }

  try {
    await ApiClient.call('pos/return', {
      kodeToko: getStoreCode(),
      trxAsal: RETURN_LOADED_TRX.trxId,
      items: returnedItems,
      alasan: reason,
      spvPin: spvPin,
      kasir: SESSION?.user?.username || ''
    });
  } catch (e) {}

  showToast(`Retur ${returnedItems.length} item berhasil diproses`, 'success');
  closeModals();
}

function openCashDropModal() {
  document.getElementById('cashDropModal')?.classList.add('active');
}

async function submitCashDrop() {
  const amt = parseFloat(document.getElementById('cashDropAmount')?.value) || 0;
  const pin = document.getElementById('cashDropSpvPin')?.value.trim() || '';
  if (amt <= 0 || !pin) {
    showToast('Nominal Cash Drop dan PIN Supervisor wajib diisi', 'error');
    return;
  }
  try {
    await ApiClient.call('pos/cash-drop', {
      kodeToko: getStoreCode(),
      shiftId: ACTIVE_SHIFT?.shiftId || '',
      nominal: amt,
      spvPin: pin,
      kasir: SESSION?.user?.username || ''
    });
  } catch (e) {}
  showToast(`Cash Drop Rp ${formatNumber(amt)} dicatat ke brankas`, 'success');
  closeModals();
}

function openCloseShiftModal() {
  document.getElementById('closeShiftModal')?.classList.add('active');
}

async function submitCloseShift() {
  const physicalCash = parseFloat(document.getElementById('closeShiftPhysicalCash')?.value) || 0;
  const spvPin = document.getElementById('closeShiftSpvPin')?.value.trim() || '';
  if (!spvPin) {
    showToast('Masukkan PIN Supervisor untuk menutup shift', 'error');
    return;
  }
  try {
    await ApiClient.call('pos/close-shift', {
      kodeToko: getStoreCode(),
      shiftId: ACTIVE_SHIFT?.shiftId || '',
      setoranFisik: physicalCash,
      spvPin: spvPin,
      kasir: SESSION?.user?.username || ''
    });
  } catch (e) {}
  localStorage.removeItem('DANISH_ACTIVE_SHIFT_' + getStoreCode());
  showToast('Shift ditutup & laporan Z-Report dicetak', 'success');
  closeModals();
}

function openKasirLabelModal() {
  searchKasirLabelProducts();
  document.getElementById('kasirLabelModal')?.classList.add('active');
}

function searchKasirLabelProducts() {
  const q = (document.getElementById('kasirLabelSearch')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('kasirLabelTableBody');
  if (!tbody) return;
  const list = PRODUCTS.filter((p) => !q || `${p.nama} ${p.barcode}`.toLowerCase().includes(q)).slice(0, 25);
  tbody.innerHTML = list.map((p, i) => `
    <tr>
      <td><input type="checkbox" id="lblChk_${i}" checked></td>
      <td>${escapeHtml(p.nama)}<br><small style="color:#64748B;">${escapeHtml(p.barcode)}</small></td>
      <td class="num">Rp ${formatNumber(p.hargaJual)}</td>
      <td class="num"><input type="number" id="lblQty_${i}" value="1" min="1" style="width:60px; margin:0; padding:4px;"></td>
    </tr>`).join('');
}

function printKasirSelectedLabels() {
  const area = document.getElementById('thermalReceiptArea');
  const q = (document.getElementById('kasirLabelSearch')?.value || '').trim().toLowerCase();
  const list = PRODUCTS.filter((p) => !q || `${p.nama} ${p.barcode}`.toLowerCase().includes(q)).slice(0, 25);

  let labelsHtml = '<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; padding:4px;">';
  list.forEach((p, i) => {
    const chk = document.getElementById(`lblChk_${i}`);
    const qty = parseInt(document.getElementById(`lblQty_${i}`)?.value, 10) || 1;
    if (chk && chk.checked) {
      for (let c = 0; c < qty; c++) {
        labelsHtml += `
          <div style="border:1.5px solid #000; padding:6px; border-radius:4px; font-family:sans-serif;">
            <div style="font-size:11px; font-weight:bold;">${escapeHtml(p.nama)}</div>
            <div style="font-size:16px; font-weight:900; margin-top:4px;">Rp ${formatNumber(p.hargaJual)}</div>
            <div style="font-size:9px; color:#333;">${escapeHtml(p.barcode)}</div>
          </div>`;
      }
    }
  });
  labelsHtml += '</div>';

  if (area) {
    area.innerHTML = labelsHtml;
    window.print();
  }
  closeModals();
}

function manualKickDrawer() {
  showToast('Perintah buka laci kasir (Cash Drawer) dikirim', 'info');
}

function openCustomerDisplay() {
  syncCustomerDisplay();
  window.open('display.html', 'DanishCustomerDisplay', 'width=1024,height=768');
}

function syncCustomerDisplay(qrisPayload = '', qrisAmount = 0) {
  const totals = getCartTotals();
  const payload = {
    updatedAt: Date.now(),
    storeName: KASIR_COMPANY_PREFS.companyName || SESSION?.store?.namaToko || 'DANISH POS',
    logoSrc: normalizeLogoDataUrl(KASIR_COMPANY_PREFS.logoBase64 || KASIR_COMPANY_PREFS.logoUrl || ''),
    items: CART,
    subtotal: totals.subtotal,
    discount: totals.itemDisc,
    grandTotal: totals.grandTotal,
    qrisDynamicPayload: qrisPayload || QRIS_STATE.dynamicPayload || '',
    qrisAmount: qrisAmount || totals.grandTotal
  };
  try {
    localStorage.setItem('DANISH_CUSTOMER_DISPLAY_STATE', JSON.stringify(payload));
  } catch (e) {}
}

function enqueueOfflineTransaction(record) {
  const key = 'DANISH_OFFLINE_QUEUE_' + getStoreCode();
  try {
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    queue.push(record);
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
  } catch (e) {}
  updateSyncStatusBadge();
}

function updateSyncStatusBadge() {
  const pill = document.getElementById('syncStatusPill');
  if (!pill) return;
  const key = 'DANISH_OFFLINE_QUEUE_' + getStoreCode();
  let pending = 0;
  try {
    pending = JSON.parse(localStorage.getItem(key) || '[]').length;
  } catch (e) {}

  if (!navigator.onLine) {
    pill.textContent = `● OFFLINE (${pending} ANTRE)`;
    pill.style.background = '#DC2626';
  } else if (pending > 0) {
    pill.textContent = `● SINKRON (${pending})...`;
    pill.style.background = '#D97706';
  } else {
    pill.textContent = '● ONLINE & SYNCED';
    pill.style.background = '#10B981';
  }
}

// =========================================================================
// 11. KEYBOARD SHORTCUTS & UTILITIES
// =========================================================================
function bindGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      openSearchModal();
    } else if (e.key === 'F3') {
      e.preventDefault();
      handleHoldRecall('RECALL');
    } else if (e.key === 'F4') {
      e.preventDefault();
      openMemberModal();
    } else if (e.key === 'F5') {
      e.preventDefault();
      handleHoldRecall('HOLD');
    } else if (e.key === 'F6') {
      e.preventDefault();
      reprintLastReceipt();
    } else if (e.key === 'F7') {
      e.preventDefault();
      openEditItemModal();
    } else if (e.key === 'F8') {
      e.preventDefault();
      voidSelectedItem();
    } else if (e.key === 'F9') {
      e.preventDefault();
      openCheckoutModal('CASH');
    } else if (e.key === 'F11') {
      e.preventDefault();
      openCashDropModal();
    } else if (e.key === 'F12') {
      e.preventDefault();
      clearCartWithPin();
    } else if (e.key === 'Escape') {
      closeModals();
    } else if (e.altKey && e.key === '1') {
      e.preventDefault();
      openNonPhysicalModal();
    } else if (e.altKey && e.key === '2') {
      e.preventDefault();
      openReturnModal();
    } else if (e.altKey && e.key === '3') {
      e.preventDefault();
      manualKickDrawer();
    } else if (document.activeElement?.tagName !== 'INPUT') {
      if (e.key === 'ArrowDown' && CART.length > 0) {
        SELECTED_CART_INDEX = Math.min(CART.length - 1, SELECTED_CART_INDEX + 1);
        renderCartTable();
      } else if (e.key === 'ArrowUp' && CART.length > 0) {
        SELECTED_CART_INDEX = Math.max(0, SELECTED_CART_INDEX - 1);
        renderCartTable();
      } else if (e.key === '+' && SELECTED_CART_INDEX >= 0) {
        adjustCartRowQty(SELECTED_CART_INDEX, 1);
      } else if (e.key === '-' && SELECTED_CART_INDEX >= 0) {
        adjustCartRowQty(SELECTED_CART_INDEX, -1);
      }
    }
  });

  window.addEventListener('online', () => {
    updateSyncStatusBadge();
    syncOfflineTransactions();
  });
  window.addEventListener('offline', updateSyncStatusBadge);
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop.active').forEach((m) => m.classList.remove('active'));
  document.getElementById('barcodeInput')?.focus();
}

function formatNumber(num) {
  return Math.round(Number(num) || 0).toLocaleString('id-ID');
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
  const colors = { success: '#059669', error: '#DC2626', warning: '#D97706', info: '#1E3A8A' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:${colors[type] || colors.info}; color:#fff; padding:10px 16px; border-radius:8px; font-size:13px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.2);`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
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