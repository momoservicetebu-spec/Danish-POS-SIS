// JS/js_admin.js - Logika Backoffice & Admin SISv1.0 (Enterprise Edition + Instant Cache + Desain)
let PENDING_TAGS_CACHE = [];
let MASTER_PRODUCTS_CACHE = [];
let SELECTED_BARCODE_SKUS = new Set();
let cachedCategories = [];

// State untuk Modal Penyesuaian Stok, Set Harga, dan Komisi
let STOCK_ADJ_ROWS = [];
let SET_HARGA_ROWS = [];
let MEMBERS_CACHE = [];
let KOMISI_ROWS = [];
let GUDANG_SUPPLIERS_CACHE = [];

function getActiveTokoCode() {
  return (typeof SESSION !== 'undefined' && SESSION && SESSION.store && SESSION.store.kodeToko)
    ? SESSION.store.kodeToko
    : 'GLOBAL';
}

if (SESSION) {
  document.getElementById('storeTitle').textContent = `${SESSION.store.namaToko} (${SESSION.store.kodeToko})`;
  document.getElementById('userBadge').textContent = `${SESSION.user.nama} [${SESSION.user.role}]`;
}

function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatIndoDate(isoStr) {
  if (!isoStr) return '-';
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// === KONTROL SIDEBAR RESPONSIF ===
function toggleAdminSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;

  if (window.innerWidth <= 1100) {
    sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

function closeMobileSidebar() {
  if (window.innerWidth <= 1100) {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('open');
  }
}

document.querySelectorAll('table').forEach(tbl => {
  if (!tbl.parentElement.classList.contains('table-responsive')) {
    const wrap = document.createElement('div');
    wrap.className = 'table-responsive';
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  }
});

// === GLOBAL LOADING SCREEN & INSTANT CACHE ===
const ADMIN_CACHE_PREFIX = 'DANISH_POS_CACHE_';

function getAdminCache(key) {
  try {
    const storeCode = getActiveTokoCode();
    const raw = localStorage.getItem(ADMIN_CACHE_PREFIX + storeCode + '_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setAdminCache(key, data) {
  try {
    const storeCode = getActiveTokoCode();
    localStorage.setItem(ADMIN_CACHE_PREFIX + storeCode + '_' + key, JSON.stringify(data));
  } catch (e) { /* abaikan jika kuota penuh */ }
}

function setLoadingScreen(isShow, titleText, subText) {
  const overlay = document.getElementById('globalLoadingOverlay');
  const titleEl = document.getElementById('globalLoadingTitle');
  const subEl = document.getElementById('globalLoadingSub');
  if (!overlay) return;

  if (isShow) {
    if (titleEl) titleEl.textContent = titleText || 'Memproses Data...';
    if (subEl) subEl.textContent = subText || 'Mohon tunggu, menyinkronkan ke server...';
    overlay.classList.add('active');
    document.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
  } else {
    overlay.classList.remove('active');
    document.querySelectorAll('.btn').forEach(b => { b.disabled = false; });
  }
}

async function callAdminApi(endpoint, payload, onSuccess, loadingLabel, silent = false) {
  const isWriteAction = !endpoint.includes('dashboard') && !endpoint.includes('products') &&
                        !endpoint.includes('categories') && !endpoint.includes('list') &&
                        !endpoint.includes('report') && !endpoint.includes('stok-toko') &&
                        !endpoint.includes('stock-card') && !endpoint.includes('users') &&
                        !endpoint.includes('get-preferences');
  const title = loadingLabel || (isWriteAction ? 'Menyimpan Data...' : 'Memuat Data...');

  if (!silent) {
    setLoadingScreen(true, title, 'Mohon tunggu, menghubungi server...');
  }
  try {
    const data = await ApiClient.call(endpoint, payload || {});
    if (!silent) setLoadingScreen(false);
    if (typeof onSuccess === 'function') onSuccess(data);
    return data;
  } catch (err) {
    if (!silent) {
      setLoadingScreen(false);
      alert('Error: ' + err.message);
    }
    return null;
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const targetSection = document.getElementById('tab-' + tabName);
  if (targetSection) targetSection.classList.add('active');
  if (btn) btn.classList.add('active');
  closeMobileSidebar();

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'master') {
    loadCategoriesAdmin();
    loadMasterCatalog();
  }
  if (tabName === 'members') loadMembersTable();
  if (tabName === 'gudang') loadGudangOverview();
  if (tabName === 'suppliers') loadSuppliersTable();
  if (tabName === 'reports') initAndLoadReport();
  if (tabName === 'so') loadBlindSOItems();
  if (tabName === 'users') loadUsersTable();
  if (tabName === 'company') loadCompanyPreferences();
  if (tabName === 'design') loadDesignSettings();
}

// =========================================================
// DASHBOARD KPI & ANALITIK
// =========================================================
function renderDashboardData(data) {
  if (!data) return;
  document.getElementById('kpiOmzet').textContent = 'Rp ' + (data.omzetHariIni || 0).toLocaleString('id-ID');
  document.getElementById('kpiStruk').textContent = (data.jumlahStruk || 0) + ' Struk';
  document.getElementById('kpiLowStock').textContent = (data.lowStockCount || 0) + ' SKU';
  document.getElementById('kpiFraud').textContent = data.flaggedFraudCount || 0;

  renderDashboardAnalytics(data);

  const auditBody = document.getElementById('auditTableBody');
  if (auditBody) {
    auditBody.innerHTML = (data.recentLogs || []).map(l => `
      <tr>
        <td>${l.waktu}</td><td>${l.toko}</td><td>${l.user}</td>
        <td><span class="badge ${l.aktivitas.includes('FAIL') || l.aktivitas.includes('BLOCK') || l.aktivitas.includes('FRAUD') ? 'badge-danger' : 'badge-ok'}">${l.aktivitas}</span></td>
        <td>${l.keterangan}</td>
      </tr>
    `).join('');
  }

 // Hapus duplikat berdasarkan SKU (ambil entri terbaru)
  const rawTags = data.pendingPriceTags || [];
  const uniqueTagMap = new Map();
  rawTags.forEach(t => {
    if (t && t.sku) uniqueTagMap.set(String(t.sku).trim(), t);
  });
  PENDING_TAGS_CACHE = Array.from(uniqueTagMap.values());

  const tagBadge = document.getElementById('priceTagCountBadge');
  if (tagBadge) tagBadge.textContent = PENDING_TAGS_CACHE.length + ' Item';

  const tagBody = document.getElementById('priceTagBody');
  if (tagBody) {
    tagBody.innerHTML = PENDING_TAGS_CACHE.map(t => `
      <tr>
        <td>${t.sku} - ${t.nama}</td>
        <td><strong>Rp ${Number(t.hargaBaru).toLocaleString('id-ID')}</strong></td>
      </tr>
    `).join('') || '<tr><td colspan="2">Semua label harga sudah terbaru.</td></tr>';
  }

  const lowStockBody = document.getElementById('lowStockTableBody');
  if (lowStockBody) {
    lowStockBody.innerHTML = (data.lowStockItems || []).map(item => `
      <tr>
        <td><strong>${item.sku}</strong> - ${item.nama}</td>
        <td><span class="badge badge-danger">${item.stokGood} Pcs</span></td>
        <td>
          <button class="btn btn-blue btn-sm" onclick="quickReorderPO('${item.sku}', ${item.hpp || 0})">Order Ulang (PO)</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="3">Seluruh stok barang dalam kondisi aman.</td></tr>';
  }

  const fefoBody = document.getElementById('fefoTableBody');
  if (fefoBody) {
    fefoBody.innerHTML = (data.expiringItems || []).map(item => {
      const isExpired = item.daysLeft <= 0;
      const statusBadge = isExpired
        ? `<span class="badge badge-danger">EXPIRED (${Math.abs(item.daysLeft)} hr lalu)</span>`
        : `<span class="badge badge-warn">Sisa ${item.daysLeft} Hari</span>`;
      return `
        <tr>
          <td><strong>${item.sku}</strong> - ${item.nama} (${item.stokGood} Pcs)</td>
          <td><strong>${item.expiredDate}</strong></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="3">Tidak ada barang mendekati tanggal kedaluwarsa.</td></tr>';
  }

  const fraudBody = document.getElementById('fraudTableBody');
  if (fraudBody) {
    fraudBody.innerHTML = (data.flaggedTransactions || []).map(f => `
      <tr>
        <td><strong>${f.trxId}</strong></td>
        <td>${f.toko}</td>
        <td>${f.waktu}</td>
        <td>${f.kasir}</td>
        <td><strong>Rp ${Number(f.total).toLocaleString('id-ID')}</strong></td>
        <td style="display:flex; gap:6px;">
          <button class="btn btn-green btn-sm" onclick="resolveFraudItem('${f.trxId}', 'VERIFIED_OK')">Tandai Wajar (OK)</button>
          <button class="btn btn-red btn-sm" onclick="resolveFraudItem('${f.trxId}', 'CONFIRMED_FRAUD')">Konfirmasi Fraud</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">Tidak ada transaksi anomali (FLAGGED_FRAUD) yang tertunda.</td></tr>';
  }
}

function loadDashboard() {
  if (SESSION && SESSION.user.role === 'Pramuniaga') {
    document.getElementById('kpiOmzet').textContent = 'RESTRICTED';
    return;
  }

  const cachedDash = getAdminCache('DASHBOARD');
  if (cachedDash) {
    renderDashboardData(cachedDash);
  }

  callAdminApi('finance/dashboard', {}, data => {
    setAdminCache('DASHBOARD', data);
    renderDashboardData(data);
  }, 'Memuat Dashboard KPI...', Boolean(cachedDash));
}

function renderDashboardAnalytics(data) {
  const chartBox = document.getElementById('salesOverviewChart');
  const trend = data.dailyTrend || [];
  if (chartBox && trend.length > 0) {
    const maxVal = Math.max(10000, ...trend.map(t => Math.max(t.sales, t.profit)));
    const w = 360, h = 175, padX = 24, padY = 22;
    const stepX = (w - padX * 2) / Math.max(1, trend.length - 1);
    const getY = v => h - padY - ((v / maxVal) * (h - padY * 2));

    const salesPts = trend.map((t, idx) => `${padX + idx * stepX},${getY(t.sales)}`).join(' ');
    const profitPts = trend.map((t, idx) => `${padX + idx * stepX},${getY(t.profit)}`).join(' ');
    const areaPts = `${padX},${h - padY} ${salesPts} ${padX + (trend.length - 1) * stepX},${h - padY}`;

    chartBox.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:100%; overflow:visible;">
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#3B82F6" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <polygon points="${areaPts}" fill="url(#salesGrad)"/>
        <polyline fill="none" stroke="#2563EB" stroke-width="2.5" points="${salesPts}"/>
        <polyline fill="none" stroke="#10B981" stroke-width="2.5" points="${profitPts}"/>
        ${trend.map((t, idx) => {
          const x = padX + idx * stepX;
          return `
            <circle cx="${x}" cy="${getY(t.sales)}" r="3.5" fill="#fff" stroke="#2563EB" stroke-width="2"/>
            <circle cx="${x}" cy="${getY(t.profit)}" r="3.5" fill="#fff" stroke="#10B981" stroke-width="2"/>
            <text x="${x}" y="${h - 4}" font-size="9" fill="#64748B" text-anchor="middle">${t.label}</text>
          `;
        }).join('')}
      </svg>`;
  }

  const catBox = document.getElementById('categoryDonutBox');
  const cats = data.categorySales || [];
  const catColors = ['#F59E0B', '#2563EB', '#10B981', '#7C3AED'];
  if (catBox) {
    const totalCat = cats.reduce((s, c) => s + c.total, 0) || 1;
    let offset = 0;
    const circles = cats.map((c, idx) => {
      const pct = (c.total / totalCat) * 100;
      const el = `<circle r="15.9" cx="21" cy="21" fill="transparent" stroke="${catColors[idx % 4]}" stroke-width="6.5" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-offset}"/>`;
      offset += pct;
      return el;
    }).join('');

    catBox.innerHTML = cats.length === 0
      ? '<small style="color:var(--text-muted);">Belum ada data penjualan kategori bulan ini.</small>'
      : `
        <svg viewBox="0 0 42 42" style="width:110px; height:110px; transform:rotate(-90deg); flex-shrink:0;">
          <circle r="15.9" cx="21" cy="21" fill="transparent" stroke="#F1F5F9" stroke-width="6.5"/>
          ${circles}
        </svg>
        <div style="flex:1; display:flex; flex-direction:column; gap:8px; font-size:12px;">
          ${cats.map((c, idx) => `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:${catColors[idx % 4]};">&#9679;</span> <strong>${c.kategori}</strong>
                <div style="color:var(--text-muted); font-size:11px;">Rp ${c.total.toLocaleString('id-ID')}</div>
              </div>
              <strong>${Math.round((c.total / totalCat) * 100)}%</strong>
            </div>
          `).join('')}
        </div>`;
  }

  const colBox = document.getElementById('collectionSummaryBox');
  const col = data.collection || { CASH: 0, QRIS: 0, EDC: 0, TEMPO: 0 };
  if (colBox) {
    const totalCol = (col.CASH + col.QRIS + col.EDC + col.TEMPO) || 0;
    const divTotal = totalCol || 1;
    const rows = [
      { label: 'Tunai (Cash)', val: col.CASH, bg: '#ECFDF5', color: '#10B981', icon: '&#128181;' },
      { label: 'QRIS / E-Wallet', val: col.QRIS, bg: '#EFF6FF', color: '#2563EB', icon: '&#128241;' },
      { label: 'Kartu Debit / EDC', val: col.EDC, bg: '#FFFBEB', color: '#F59E0B', icon: '&#128179;' },
      { label: 'Kredit / Tempo', val: col.TEMPO, bg: '#F5F3FF', color: '#7C3AED', icon: '&#127974;' }
    ];
    colBox.innerHTML = rows.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-radius:10px; background:#F8FAFC;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:28px; height:28px; border-radius:8px; background:${r.bg}; color:${r.color}; display:flex; align-items:center; justify-content:center;">${r.icon}</span>
          <span style="font-size:12px; font-weight:600;">${r.label}</span>
        </div>
        <div style="text-align:right; font-size:12px;">
          <strong>Rp ${r.val.toLocaleString('id-ID')}</strong>
          <span style="color:var(--text-muted); margin-left:6px;">${totalCol ? Math.round((r.val / divTotal) * 100) : 0}%</span>
        </div>
      </div>
    `).join('') + `
      <div style="display:flex; justify-content:space-between; padding-top:6px; border-top:1px dashed var(--border); font-size:13px;">
        <strong>Total Collection</strong>
        <strong style="color:var(--primary);">Rp ${totalCol.toLocaleString('id-ID')}</strong>
      </div>`;
  }

  const topBody = document.getElementById('topSellingBody');
  if (topBody) {
    topBody.innerHTML = (data.topSellingItems || []).map((it, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td>${it.nama}</td>
        <td>${it.qty.toLocaleString('id-ID')} Pcs</td>
        <td><strong>Rp ${it.total.toLocaleString('id-ID')}</strong></td>
      </tr>
    `).join('') || '<tr><td colspan="4">Belum ada data penjualan bulan ini.</td></tr>';
  }

  const stkBox = document.getElementById('stockSummaryBox');
  const stk = data.stockSummary || { totalSkuCount: 0, totalStockQty: 0, totalStockValue: 0 };
  if (stkBox) {
    stkBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; padding:10px; background:#EFF6FF; border-radius:10px;">
        <span style="font-size:12px; font-weight:600; color:#1E40AF;">&#128230; Total SKU Aktif</span>
        <strong>${stk.totalSkuCount.toLocaleString('id-ID')} SKU</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:10px; background:#ECFDF5; border-radius:10px;">
        <span style="font-size:12px; font-weight:600; color:#065F46;">&#128202; Total Fisik Stok</span>
        <strong>${stk.totalStockQty.toLocaleString('id-ID')} Pcs</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:10px; background:#FFFBEB; border-radius:10px;">
        <span style="font-size:12px; font-weight:600; color:#92400E;">&#128176; Valuasi Aset (HPP)</span>
        <strong>Rp ${stk.totalStockValue.toLocaleString('id-ID')}</strong>
      </div>`;
  }

  const mChart = document.getElementById('monthlyProfitChart');
  const mArr = data.monthlyProfitArr || [];
  if (mChart && mArr.length === 12) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const maxM = Math.max(10000, ...mArr);
    mChart.innerHTML = `
      <div style="display:flex; align-items:flex-end; justify-content:space-between; height:175px; padding-top:16px; gap:6px;">
        ${mArr.map((val, idx) => {
          const pct = Math.max(6, Math.round((val / maxM) * 100));
          return `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
              <div title="${months[idx]}: Rp ${val.toLocaleString('id-ID')}" style="width:100%; max-width:18px; height:${pct}%; background:linear-gradient(180deg, #10B981, #059669); border-radius:6px 6px 2px 2px;"></div>
              <span style="font-size:9px; color:var(--text-muted); margin-top:4px;">${months[idx]}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  const rFeed = document.getElementById('recentTrxFeed');
  if (rFeed) {
    rFeed.innerHTML = (data.recentTransactions || []).map(t => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border:1px solid var(--border); border-radius:10px;">
        <div>
          <strong style="font-size:12px; color:var(--blue);">${t.trxId}</strong>
          <div style="font-size:11px; color:var(--text-muted);">Kasir: ${t.kasir} • ${t.tipe}</div>
        </div>
        <div style="text-align:right;">
          <strong style="font-size:12px;">Rp ${t.total.toLocaleString('id-ID')}</strong>
          <div style="font-size:10px; color:var(--text-muted);">${t.waktu}</div>
        </div>
      </div>
    `).join('') || '<small style="color:var(--text-muted);">Belum ada transaksi terbaru.</small>';
  }

  const bBox = document.getElementById('branchSalesChart');
  const branches = data.branchSales || [];
  const bColors = ['#2563EB', '#10B981', '#F59E0B', '#7C3AED', '#E11D48'];
  if (bBox) {
    const maxB = Math.max(10000, ...branches.map(b => b.total));
    bBox.innerHTML = branches.length === 0
      ? '<small style="color:var(--text-muted);">Belum ada data penjualan cabang bulan ini.</small>'
      : branches.map((b, idx) => `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
              <strong>${b.toko}</strong>
              <span>Rp ${b.total.toLocaleString('id-ID')}</span>
            </div>
            <div style="width:100%; height:10px; background:#F1F5F9; border-radius:99px; overflow:hidden;">
              <div style="width:${Math.max(8, Math.round((b.total / maxB) * 100))}%; height:100%; background:${bColors[idx % 5]}; border-radius:99px;"></div>
            </div>
          </div>
        `).join('');
  }
}

function quickReorderPO(sku, lastHpp) {
  const supplierTabBtn = Array.from(document.querySelectorAll('.tab-btn'))
    .find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes("'suppliers'"));
  if (supplierTabBtn) switchTab('suppliers', supplierTabBtn);
  const skuInp = document.getElementById('purSku');
  const priceInp = document.getElementById('purBuyPrice');
  const qtyInp = document.getElementById('purQty');
  if (skuInp) skuInp.value = sku;
  if (priceInp && lastHpp > 0) priceInp.value = lastHpp;
  if (qtyInp) {
    qtyInp.value = 12;
    qtyInp.focus();
    qtyInp.select();
  }
}

function resolveFraudItem(trxId, resolution) {
  const label = resolution === 'VERIFIED_OK' ? 'WAJAR / AMAN (VERIFIED_OK)' : 'PELANGGARAN / FRAUD (CONFIRMED_FRAUD)';
  const note = prompt(`INVESTIGASI AUDIT TRANSAKSI: ${trxId}\nStatus Baru: ${label}\n\nMasukkan catatan hasil pemeriksaan:`, '');
  if (note === null) return;

  callAdminApi('security/resolve-fraud', { trxId, resolution, note: note || '-' }, res => {
    alert(res.message);
    loadDashboard();
  }, 'Menyimpan Hasil Audit...');
}

function printPendingPriceTags() {
  if (!PENDING_TAGS_CACHE || PENDING_TAGS_CACHE.length === 0) {
    return alert('Tidak ada antrean label harga baru untuk dicetak.');
  }
  const today = new Date().toLocaleDateString('id-ID');
  const area = document.getElementById('priceTagPrintArea');
  area.innerHTML = PENDING_TAGS_CACHE.map(t => `
    <div style="border:2px solid #000; padding:10px; border-radius:6px; font-family:sans-serif; background:#fff; break-inside:avoid;">
      <div style="font-size:11px; font-weight:700; border-bottom:1px solid #000; padding-bottom:4px;">${SESSION.store.namaToko}</div>
      <div style="font-size:13px; font-weight:700; margin:6px 0; min-height:32px;">${t.nama}</div>
      <div style="font-size:22px; font-weight:900; text-align:right;">Rp ${Number(t.hargaBaru).toLocaleString('id-ID')}</div>
      <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:6px; color:#333;">
        <span>SKU: ${t.sku}</span>
        <span>Upd: ${today}</span>
      </div>
    </div>
  `).join('');

  area.classList.add('printing');
  window.print();
  area.classList.remove('printing');

  if (confirm('Tandai semua label harga ini sudah dicetak (hapus dari antrean)?')) {
    callAdminApi('admin/mark-tags-printed', {}, res => {
      alert(res.message);
      loadDashboard();
    }, 'Memperbarui Status Label...');
  }
}

// =========================================================
// HELPER PENCARIAN BARANG DI KATALOG CACHE
// =========================================================
function populateCatalogDataList() {
  const dl = document.getElementById('catalogDataList');
  if (!dl) return;
  dl.innerHTML = MASTER_PRODUCTS_CACHE.map(p => {
    const primaryBc = String(p.barcode || p.sku).split(',')[0].trim();
    return `<option value="${p.sku}">${p.nama} (BC: ${primaryBc} | Stok: ${p.stokTerkini != null ? p.stokTerkini : (p.saldoAwal || 0)})</option>`;
  }).join('');
}

function findCatalogProduct(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  return MASTER_PRODUCTS_CACHE.find(p => {
    const barcodes = String(p.barcode || '').split(',').map(b => b.trim().toLowerCase());
    return p.sku.toLowerCase() === q ||
           barcodes.includes(q) ||
           p.nama.toLowerCase() === q ||
           p.nama.toLowerCase().includes(q);
  }) || null;
}

// =========================================================
// MODAL & LOGIKA MASTER KATEGORI BARANG
// =========================================================
function openCategoryModal() {
  resetCategoryForm();
  document.getElementById('categoryModal').classList.add('open');
  setTimeout(() => document.getElementById('catNama').focus(), 100);
}

function loadCategoriesAdmin() {
  const cachedCat = getAdminCache('CATEGORIES');
  if (cachedCat && Array.isArray(cachedCat)) {
    cachedCategories = cachedCat;
    renderCategoryTable();
    populateCategoryDropdown();
  }

  callAdminApi('admin/categories', {}, data => {
    cachedCategories = (data && data.categories) ? data.categories : [{ id: 'CAT-01', nama: 'Umum', lokasi: '- Tidak Pakai -' }];
    setAdminCache('CATEGORIES', cachedCategories);
    renderCategoryTable();
    populateCategoryDropdown();
  }, 'Memuat Kategori Barang...', Boolean(cachedCat));
}

function renderCategoryTable() {
  const tbody = document.getElementById('categoryTableBody');
  const badge = document.getElementById('totalKategoriBadge');
  if (badge) badge.textContent = cachedCategories.length;
  if (!tbody) return;

  if (cachedCategories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Belum ada kategori barang.</td></tr>';
    return;
  }

  tbody.innerHTML = cachedCategories.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.nama}</td>
      <td><span class="badge ${c.lokasi === '- Tidak Pakai -' ? 'badge-warn' : 'badge-ok'}">${c.lokasi}</span></td>
      <td style="white-space:nowrap;">
        <button type="button" class="btn btn-blue btn-sm" onclick="editCategoryForm('${c.id}')">Edit</button>
        ${c.nama.toLowerCase() !== 'umum' ? `<button type="button" class="btn btn-red btn-sm" onclick="deleteCategoryAdmin('${c.id}', '${c.nama.replace(/'/g, "\\'")}')">Hapus</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function populateCategoryDropdown() {
  const select = document.getElementById('prdKategori');
  if (select) {
    const currentVal = select.value;
    select.innerHTML = cachedCategories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('');
    if (currentVal && cachedCategories.some(c => c.nama === currentVal)) {
      select.value = currentVal;
    }
  }

  const filterSel = document.getElementById('masterCategoryFilter');
  if (filterSel) {
    const curFilter = filterSel.value;
    filterSel.innerHTML = '<option value="">Semua Kategori</option>' +
      cachedCategories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('');
    filterSel.value = curFilter;
  }
}

function editCategoryForm(id) {
  const item = cachedCategories.find(c => c.id === id);
  if (!item) return;
  document.getElementById('catId').value = item.id;
  document.getElementById('catNama').value = item.nama;
  document.getElementById('catLokasi').value = item.lokasi || '- Tidak Pakai -';
  document.getElementById('catNama').focus();
}

function resetCategoryForm() {
  document.getElementById('catId').value = '';
  document.getElementById('catNama').value = '';
  document.getElementById('catLokasi').value = '- Tidak Pakai -';
}

function submitCategory(isSaveAndNew) {
  const id = document.getElementById('catId').value.trim();
  const nama = document.getElementById('catNama').value.trim();
  const lokasi = document.getElementById('catLokasi').value;

  if (!nama) {
    alert('Nama Kategori wajib diisi!');
    document.getElementById('catNama').focus();
    return;
  }

  callAdminApi('admin/save-category', { id, nama, lokasi }, res => {
    loadCategoriesAdmin();
    resetCategoryForm();
    if (isSaveAndNew) {
      document.getElementById('catNama').focus();
    } else {
      alert(res.message || 'Kategori berhasil disimpan.');
    }
  }, 'Menyimpan Kategori Barang...');
}

function deleteCategoryAdmin(id, nama) {
  if (!confirm('Hapus kategori "' + nama + '"?')) return;
  callAdminApi('admin/delete-category', { id }, () => {
    loadCategoriesAdmin();
  }, 'Menghapus Kategori...');
}

// =========================================================
// MODAL & LOGIKA MASTER BARANG LENGKAP (DANISH POS)
// =========================================================
function openProductModal() {
  resetProductForm();
  const titleEl = document.getElementById('productModalTitle');
  if (titleEl) titleEl.textContent = 'Tambah Barang Baru';
  document.getElementById('productModal').classList.add('open');
  setTimeout(() => document.getElementById('prdNama').focus(), 100);
}

function switchProductSubTab(subName, btn) {
  document.querySelectorAll('.prd-subtab-panel').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.prd-subtab-btn').forEach(b => {
    b.classList.remove('btn-blue');
    b.classList.add('btn-dark');
  });
  const target = document.getElementById('prd-subtab-' + subName);
  if (target) target.style.display = 'block';
  if (btn) {
    btn.classList.remove('btn-dark');
    btn.classList.add('btn-blue');
  }
}

function promptProductImageUrl() {
  const cur = document.getElementById('prdImageUrl').value || '';
  const url = prompt('Masukkan URL Gambar Produk (HTTPS):', cur);
  if (url === null) return;
  document.getElementById('prdImageUrl').value = url.trim();
  renderProductImagePreview(url.trim());
}

function clearProductImageUrl() {
  document.getElementById('prdImageUrl').value = '';
  renderProductImagePreview('');
}

function renderProductImagePreview(url) {
  const box = document.getElementById('prdImagePreview');
  if (!box) return;
  if (url) {
    box.innerHTML = `<img src="${url}" alt="Produk" style="max-width:100%; max-height:140px; object-fit:contain;" onerror="this.parentElement.innerHTML='Gambar gagal dimuat'">`;
  } else {
    box.innerHTML = 'Tidak ada gambar';
  }
}

function loadMasterCatalog() {
  const cachedProd = getAdminCache('PRODUCTS');
  const hasCache = Boolean(cachedProd && Array.isArray(cachedProd) && cachedProd.length > 0);
  if (hasCache) {
    MASTER_PRODUCTS_CACHE = cachedProd;
    populateCatalogDataList();
    filterMasterCatalog();
  }

  callAdminApi('admin/products', {}, items => {
    MASTER_PRODUCTS_CACHE = items || [];
    setAdminCache('PRODUCTS', MASTER_PRODUCTS_CACHE);
    populateCatalogDataList();
    filterMasterCatalog();
  }, 'Memuat Katalog Barang...', hasCache);
}

function renderMasterCatalogTable(items) {
  const tbody = document.getElementById('masterCatalogBody');
  tbody.innerHTML = items.map(p => `
    <tr style="${p.isActive === false ? 'opacity:0.55; background:#FEF2F2;' : ''}">
      <td>
        <input type="checkbox" class="barcode-chk" value="${p.sku}"
          ${SELECTED_BARCODE_SKUS.has(p.sku) ? 'checked' : ''}
          onchange="toggleSingleBarcodeCheckbox('${p.sku}', this.checked)">
      </td>
      <td><strong>${p.sku}</strong></td>
      <td><code>${p.barcode}</code></td>
      <td>
        ${p.nama}
        ${p.isActive === false ? '<span class="badge badge-danger" style="margin-left:4px;">Non Aktif</span>' : ''}
      </td>
      <td>${p.kategori}</td>
      <td>${p.satuan}</td>
      <td>${p.hargaModal !== null ? 'Rp ' + Number(p.hargaModal).toLocaleString('id-ID') : '<span style="color:#94A3B8;">Hidden</span>'}</td>
      <td><strong>Rp ${Number(p.hargaJual || 0).toLocaleString('id-ID')}</strong></td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-blue btn-sm" onclick='fillProductForm(${JSON.stringify(p)})'>Edit</button>
        <button class="btn btn-violet btn-sm" onclick="openStockCardModal('${p.sku}', '${p.nama.replace(/'/g, "\\'")}')">Kartu Stok</button>
        <button class="btn btn-red btn-sm" onclick="deleteMasterProduct('${p.sku}', '${p.nama.replace(/'/g, "\\'")}')">Hapus</button>
      </td>
    </tr>
  `).join('');
  updateSelectedBarcodeCounter();
}

function deleteMasterProduct(sku, nama) {
  if (!confirm(`Yakin ingin menghapus barang ini dari katalog?\n\nSKU: ${sku}\nNama: ${nama}`)) return;
  callAdminApi('admin/delete-product', { sku, nama }, res => {
    SELECTED_BARCODE_SKUS.delete(sku);
    alert(res.message);
    loadMasterCatalog();
  }, 'Menghapus Barang...');
}

function filterMasterCatalog() {
  const q = (document.getElementById('masterSearchInput').value || '').toLowerCase().trim();
  const cat = (document.getElementById('masterCategoryFilter')?.value || '').trim();
  const filtered = MASTER_PRODUCTS_CACHE.filter(p => {
    const matchText = !q ||
      p.sku.toLowerCase().includes(q) ||
      String(p.barcode).toLowerCase().includes(q) ||
      p.nama.toLowerCase().includes(q);
    const matchCat = !cat || p.kategori === cat;
    return matchText && matchCat;
  });
  renderMasterCatalogTable(filtered);
}

function toggleSingleBarcodeCheckbox(sku, isChecked) {
  if (isChecked) SELECTED_BARCODE_SKUS.add(sku);
  else SELECTED_BARCODE_SKUS.delete(sku);
  updateSelectedBarcodeCounter();
}

function toggleAllBarcodeCheckboxes(masterChk) {
  document.querySelectorAll('.barcode-chk').forEach(chk => {
    chk.checked = masterChk.checked;
    if (masterChk.checked) SELECTED_BARCODE_SKUS.add(chk.value);
    else SELECTED_BARCODE_SKUS.delete(chk.value);
  });
  updateSelectedBarcodeCounter();
}

function updateSelectedBarcodeCounter() {
  const el = document.getElementById('selectedBarcodeCount');
  if (el) el.textContent = SELECTED_BARCODE_SKUS.size;
}

function openBarcodeStudioModal() {
  if (SELECTED_BARCODE_SKUS.size === 0) {
    return alert('Centang minimal satu barang pada tabel Katalog Master Barang terlebih dahulu.');
  }
  const selectedItems = MASTER_PRODUCTS_CACHE.filter(p => SELECTED_BARCODE_SKUS.has(p.sku));
  const tbody = document.getElementById('barcodeStudioTableBody');
  tbody.innerHTML = selectedItems.map(p => {
    const primaryBarcode = String(p.barcode || p.sku).split(',')[0].trim();
    return `
      <tr>
        <td><strong>${p.sku}</strong></td>
        <td><code>${primaryBarcode}</code></td>
        <td>${p.nama}</td>
        <td>Rp ${Number(p.hargaJual || 0).toLocaleString('id-ID')}</td>
        <td><input type="number" class="barcode-qty-inp" data-sku="${p.sku}" data-code="${primaryBarcode}" data-nama="${p.nama}" data-harga="${p.hargaJual || 0}" value="2" min="1" max="200" style="width:85px;"></td>
      </tr>
    `;
  }).join('');
  document.getElementById('barcodeStudioModal').classList.add('open');
}

function executePrintBarcodeStickers() {
  const cols = document.getElementById('barcodeLayoutCols').value;
  const showPrice = document.getElementById('barcodeShowPrice').value === 'true';
  const area = document.getElementById('barcodeStickerPrintArea');
  area.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  area.style.gap = '6px';

  let stickersHtml = '';
  let idx = 0;
  document.querySelectorAll('.barcode-qty-inp').forEach(inp => {
    const qty = Math.max(1, Number(inp.value) || 1);
    const code = inp.dataset.code;
    const nama = inp.dataset.nama;
    const harga = Number(inp.dataset.harga).toLocaleString('id-ID');

    for (let i = 0; i < qty; i++) {
      idx++;
      stickersHtml += `
        <div style="border:1px dashed #94A3B8; padding:6px; text-align:center; background:#fff; break-inside:avoid;">
          <div style="font-size:10px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${nama}</div>
          <svg id="bc-svg-${idx}" data-code="${code}" style="max-width:100%; height:36px;"></svg>
          ${showPrice ? `<div style="font-size:12px; font-weight:900;">Rp ${harga}</div>` : ''}
        </div>
      `;
    }
  });

  area.innerHTML = stickersHtml;
  if (typeof JsBarcode !== 'undefined') {
    area.querySelectorAll('svg').forEach(svg => {
      JsBarcode(svg, svg.dataset.code, {
        format: 'CODE128', width: 1.4, height: 32, displayValue: true, fontSize: 10, margin: 0
      });
    });
  }

  closeModal('barcodeStudioModal');
  area.classList.add('printing');
  window.print();
  area.classList.remove('printing');
}

function openStockCardModal(sku, namaBarang) {
  document.getElementById('scModalTitle').textContent = `Kartu Stok: ${sku}`;
  document.getElementById('scModalSubtitle').textContent = namaBarang;
  const tbody = document.getElementById('stockCardTableBody');
  tbody.innerHTML = '<tr><td colspan="6">Memuat riwayat mutasi stok...</td></tr>';
  document.getElementById('stockCardModal').classList.add('open');

  callAdminApi('inventory/stock-card', { sku }, rows => {
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Belum ada riwayat mutasi stok untuk SKU ini.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.waktu}</td>
        <td><span class="badge ${r.masuk > 0 ? 'badge-ok' : 'badge-warn'}">${r.jenis}</span></td>
        <td>${r.referensi || '-'}</td>
        <td style="color:var(--primary); font-weight:700;">${r.masuk > 0 ? '+' + r.masuk : '-'}</td>
        <td style="color:var(--red); font-weight:700;">${r.keluar > 0 ? '-' + r.keluar : '-'}</td>
        <td><strong>${r.saldoAkhir}</strong></td>
      </tr>
    `).join('');
  }, 'Memuat Kartu Stok...');
}

function fillProductForm(p) {
  resetProductForm();
  const titleEl = document.getElementById('productModalTitle');
  if (titleEl) titleEl.textContent = `Edit Barang: ${p.sku}`;

  document.getElementById('prdSku').value = p.sku || '';
  document.getElementById('prdBarcode').value = p.barcode || '';
  document.getElementById('prdNama').value = p.nama || '';
  if (document.getElementById('prdNamaSingkat')) document.getElementById('prdNamaSingkat').value = p.namaSingkat || '';
  document.getElementById('prdKategori').value = p.kategori || 'Umum';
  if (document.getElementById('prdTipe')) document.getElementById('prdTipe').value = p.tipe || 'Persediaan';
  if (document.getElementById('prdAtribut')) document.getElementById('prdAtribut').value = p.atribut || '';
  if (document.getElementById('prdUkuran')) document.getElementById('prdUkuran').value = p.ukuran || '';
  document.getElementById('prdSatuan').value = p.satuan || 'PCS';
  if (document.getElementById('prdPlu')) document.getElementById('prdPlu').value = p.plu || '';
  if (document.getElementById('prdSaldoAwal')) document.getElementById('prdSaldoAwal').value = p.saldoAwal || 0;
  if (document.getElementById('prdCurrentStockBadge')) document.getElementById('prdCurrentStockBadge').textContent = p.stokTerkini != null ? p.stokTerkini : (p.saldoAwal || 0);
  document.getElementById('prdModal').value = p.hargaModal || 0;
  document.getElementById('prdJual').value = p.hargaJual || 0;
  if (document.getElementById('prdHargaMember')) document.getElementById('prdHargaMember').value = p.hargaMember || 0;
  if (document.getElementById('prdHargaT3')) document.getElementById('prdHargaT3').value = p.hargaTingkat3 || 0;
  if (document.getElementById('prdHargaT4')) document.getElementById('prdHargaT4').value = p.hargaTingkat4 || 0;
  if (document.getElementById('prdHargaT5')) document.getElementById('prdHargaT5').value = p.hargaTingkat5 || 0;
  document.getElementById('prdHighRisk').value = String(Boolean(p.isHighRisk));
  if (document.getElementById('prdNonAktif')) document.getElementById('prdNonAktif').checked = p.isActive === false;
  if (document.getElementById('prdMinStock')) document.getElementById('prdMinStock').value = p.minStock != null ? p.minStock : 10;
  if (document.getElementById('prdRak')) document.getElementById('prdRak').value = p.lokasiRak || '';
  if (document.getElementById('prdPajak')) document.getElementById('prdPajak').value = p.pajakPct || 0;
  if (document.getElementById('prdCatatan')) document.getElementById('prdCatatan').value = p.catatan || '';
  if (document.getElementById('prdImageUrl')) document.getElementById('prdImageUrl').value = p.imageUrl || '';
  renderProductImagePreview(p.imageUrl || '');

  document.getElementById('productModal').classList.add('open');
  setTimeout(() => document.getElementById('prdNama').focus(), 100);
}

function resetProductForm() {
  document.getElementById('prdSku').value = '';
  document.getElementById('prdBarcode').value = '';
  document.getElementById('prdNama').value = '';
  if (document.getElementById('prdNamaSingkat')) document.getElementById('prdNamaSingkat').value = '';
  document.getElementById('prdKategori').value = 'Umum';
  if (document.getElementById('prdTipe')) document.getElementById('prdTipe').value = 'Persediaan';
  if (document.getElementById('prdAtribut')) document.getElementById('prdAtribut').value = '';
  if (document.getElementById('prdUkuran')) document.getElementById('prdUkuran').value = '';
  document.getElementById('prdSatuan').value = 'PCS';
  if (document.getElementById('prdPlu')) document.getElementById('prdPlu').value = '';
  if (document.getElementById('prdSaldoAwal')) document.getElementById('prdSaldoAwal').value = 0;
  if (document.getElementById('prdCurrentStockBadge')) document.getElementById('prdCurrentStockBadge').textContent = '0';
  document.getElementById('prdModal').value = 0;
  document.getElementById('prdJual').value = 0;
  if (document.getElementById('prdHargaMember')) document.getElementById('prdHargaMember').value = 0;
  if (document.getElementById('prdHargaT3')) document.getElementById('prdHargaT3').value = 0;
  if (document.getElementById('prdHargaT4')) document.getElementById('prdHargaT4').value = 0;
  if (document.getElementById('prdHargaT5')) document.getElementById('prdHargaT5').value = 0;
  document.getElementById('prdHighRisk').value = 'false';
  if (document.getElementById('prdNonAktif')) document.getElementById('prdNonAktif').checked = false;
  if (document.getElementById('prdMinStock')) document.getElementById('prdMinStock').value = 10;
  if (document.getElementById('prdRak')) document.getElementById('prdRak').value = '';
  if (document.getElementById('prdPajak')) document.getElementById('prdPajak').value = 0;
  if (document.getElementById('prdCatatan')) document.getElementById('prdCatatan').value = '';
  clearProductImageUrl();
  const firstSubTab = document.querySelector('.prd-subtab-btn');
  if (firstSubTab) switchProductSubTab('info', firstSubTab);
}

function submitProduct(isSaveAndNew) {
  const payload = {
    sku: document.getElementById('prdSku').value.trim(),
    barcode: document.getElementById('prdBarcode').value.trim(),
    nama: document.getElementById('prdNama').value.trim(),
    namaSingkat: document.getElementById('prdNamaSingkat') ? document.getElementById('prdNamaSingkat').value.trim() : '',
    kategori: document.getElementById('prdKategori').value || 'Umum',
    tipe: document.getElementById('prdTipe') ? document.getElementById('prdTipe').value : 'Persediaan',
    atribut: document.getElementById('prdAtribut') ? document.getElementById('prdAtribut').value.trim() : '',
    ukuran: document.getElementById('prdUkuran') ? document.getElementById('prdUkuran').value.trim() : '',
    satuan: document.getElementById('prdSatuan').value.trim() || 'PCS',
    plu: document.getElementById('prdPlu') ? document.getElementById('prdPlu').value.trim() : '',
    saldoAwal: document.getElementById('prdSaldoAwal') ? (Number(document.getElementById('prdSaldoAwal').value) || 0) : 0,
    hargaModal: Number(document.getElementById('prdModal').value) || 0,
    hargaJual: Number(document.getElementById('prdJual').value) || 0,
    hargaMember: document.getElementById('prdHargaMember') ? (Number(document.getElementById('prdHargaMember').value) || 0) : 0,
    hargaTingkat3: document.getElementById('prdHargaT3') ? (Number(document.getElementById('prdHargaT3').value) || 0) : 0,
    hargaTingkat4: document.getElementById('prdHargaT4') ? (Number(document.getElementById('prdHargaT4').value) || 0) : 0,
    hargaTingkat5: document.getElementById('prdHargaT5') ? (Number(document.getElementById('prdHargaT5').value) || 0) : 0,
    isHighRisk: document.getElementById('prdHighRisk').value === 'true',
    isActive: document.getElementById('prdNonAktif') ? !document.getElementById('prdNonAktif').checked : true,
    minStock: document.getElementById('prdMinStock') ? (Number(document.getElementById('prdMinStock').value) || 0) : 10,
    lokasiRak: document.getElementById('prdRak') ? document.getElementById('prdRak').value.trim() : '',
    pajakPct: document.getElementById('prdPajak') ? (Number(document.getElementById('prdPajak').value) || 0) : 0,
    catatan: document.getElementById('prdCatatan') ? document.getElementById('prdCatatan').value.trim() : '',
    imageUrl: document.getElementById('prdImageUrl') ? document.getElementById('prdImageUrl').value.trim() : ''
  };

  if (!payload.sku || !payload.barcode || !payload.nama) {
    return alert('Kode (SKU), UPC/Barcode, dan Nama Barang wajib diisi.');
  }

  callAdminApi('admin/save-product', payload, res => {
    loadMasterCatalog();
    if (isSaveAndNew) {
      resetProductForm();
      const titleEl = document.getElementById('productModalTitle');
      if (titleEl) titleEl.textContent = 'Tambah Barang Baru';
      document.getElementById('prdNama').focus();
    } else {
      closeModal('productModal');
      alert(res.message);
    }
  }, 'Menyimpan Master Barang...');
}

// =========================================================
// MODAL 5: PENYESUAIAN STOK (DENGAN TANGGAL & CETAK BUKTI)
// =========================================================
function generateAdjNumber() {
  const rand = String(Math.floor(10000 + Math.random() * 90000));
  return 'ADJ-' + getTodayIsoDate().replace(/-/g, '') + '-' + rand.slice(0, 3);
}

function openStockAdjModal() {
  resetStockAdjForm();
  document.getElementById('stockAdjModal').classList.add('open');
  setTimeout(() => document.getElementById('adjSearchInput').focus(), 100);
}

function resetStockAdjForm() {
  document.getElementById('adjNomor').value = generateAdjNumber();
  document.getElementById('adjTanggal').value = getTodayIsoDate();
  document.getElementById('adjKeterangan').value = '';
  document.getElementById('adjSearchInput').value = '';
  STOCK_ADJ_ROWS = [];
  renderStockAdjTable();
}

function clearStockAdjRows() {
  STOCK_ADJ_ROWS = [];
  renderStockAdjTable();
}

function addStockAdjItem() {
  const inp = document.getElementById('adjSearchInput');
  const prod = findCatalogProduct(inp.value);
  if (!prod) {
    alert('Barang tidak ditemukan di katalog! Pastikan SKU / Barcode / Nama benar.');
    inp.focus();
    return;
  }

  const existing = STOCK_ADJ_ROWS.find(r => r.sku === prod.sku);
  if (existing) {
    existing.perubahan += 1;
  } else {
    const curStock = prod.stokTerkini != null ? Number(prod.stokTerkini) : (Number(prod.saldoAwal) || 0);
    STOCK_ADJ_ROWS.push({
      sku: prod.sku,
      nama: prod.nama,
      stokAwal: curStock,
      perubahan: 0,
      satuan: prod.satuan || 'PCS'
    });
  }
  inp.value = '';
  renderStockAdjTable();
}

function updateStockAdjQty(idx, val) {
  const delta = Number(val) || 0;
  STOCK_ADJ_ROWS[idx].perubahan = delta;
  const endEl = document.getElementById('adj-end-' + idx);
  if (endEl) {
    const stokAkhir = STOCK_ADJ_ROWS[idx].stokAwal + delta;
    endEl.textContent = stokAkhir;
    endEl.style.color = stokAkhir < 0 ? 'var(--red)' : 'var(--text-main)';
  }
}

function removeStockAdjRow(idx) {
  STOCK_ADJ_ROWS.splice(idx, 1);
  renderStockAdjTable();
}

function renderStockAdjTable() {
  const tbody = document.getElementById('stockAdjTableBody');
  if (!tbody) return;
  if (STOCK_ADJ_ROWS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">Belum ada barang dipilih. Ketik atau scan SKU/Barcode di atas.</td></tr>';
    return;
  }
  tbody.innerHTML = STOCK_ADJ_ROWS.map((r, idx) => {
    const stokAkhir = r.stokAwal + r.perubahan;
    return `
      <tr>
        <td><strong>${r.sku}</strong></td>
        <td>${r.nama}</td>
        <td style="text-align:right; background:#F8FAFC;">${r.stokAwal}</td>
        <td style="text-align:right;">
          <input type="number" value="${r.perubahan}" onchange="updateStockAdjQty(${idx}, this.value)" oninput="updateStockAdjQty(${idx}, this.value)" style="width:110px; text-align:right; font-weight:700; border-color:var(--blue);" placeholder="+/- 0">
        </td>
        <td>${r.satuan}</td>
        <td id="adj-end-${idx}" style="text-align:right; font-weight:800; background:#F8FAFC; color:${stokAkhir < 0 ? 'var(--red)' : 'var(--text-main)'};">${stokAkhir}</td>
        <td><button type="button" class="btn btn-red btn-sm" onclick="removeStockAdjRow(${idx})">&#10006;</button></td>
      </tr>
    `;
  }).join('');
}

function printStockAdjustment() {
  if (STOCK_ADJ_ROWS.length === 0) {
    return alert('Tambahkan minimal satu barang terlebih dahulu sebelum mencetak bukti penyesuaian stok.');
  }
  const nomor = document.getElementById('adjNomor').value;
  const tanggal = formatIndoDate(document.getElementById('adjTanggal').value);
  const ket = document.getElementById('adjKeterangan').value.trim() || '-';
  const area = document.getElementById('stockAdjPrintArea');

  area.innerHTML = `
    <div style="font-family:sans-serif; color:#000; max-width:800px; margin:0 auto;">
      <div style="display:flex; justify-content:space-between; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">
        <div>
          <strong style="font-size:16px;">${SESSION ? SESSION.store.namaToko : 'TOKO'}</strong><br>
          <span style="font-size:12px;">BUKTI DOKUMEN PENYESUAIAN STOK (STOCK ADJUSTMENT)</span>
        </div>
        <div style="text-align:right; font-size:12px;">
          <div><strong>No. Dokumen:</strong> ${nomor}</div>
          <div><strong>Tanggal Penyesuaian:</strong> ${tanggal}</div>
          <div><strong>Petugas:</strong> ${SESSION ? SESSION.user.nama : '-'}</div>
        </div>
      </div>
      <div style="font-size:12px; margin-bottom:12px;">
        <strong>Keterangan:</strong> ${ket}
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:24px;">
        <thead>
          <tr>
            <th style="border:1px solid #000; padding:6px; text-align:left;">No</th>
            <th style="border:1px solid #000; padding:6px; text-align:left;">Kode#</th>
            <th style="border:1px solid #000; padding:6px; text-align:left;">Nama Barang</th>
            <th style="border:1px solid #000; padding:6px; text-align:right;">Stok Sistem</th>
            <th style="border:1px solid #000; padding:6px; text-align:right;">Perubahan Kts</th>
            <th style="border:1px solid #000; padding:6px; text-align:left;">Satuan</th>
            <th style="border:1px solid #000; padding:6px; text-align:right;">Stok Akhir</th>
          </tr>
        </thead>
        <tbody>
          ${STOCK_ADJ_ROWS.map((r, i) => `
            <tr>
              <td style="border:1px solid #000; padding:6px;">${i + 1}</td>
              <td style="border:1px solid #000; padding:6px;">${r.sku}</td>
              <td style="border:1px solid #000; padding:6px;">${r.nama}</td>
              <td style="border:1px solid #000; padding:6px; text-align:right;">${r.stokAwal}</td>
              <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:bold;">${r.perubahan > 0 ? '+' + r.perubahan : r.perubahan}</td>
              <td style="border:1px solid #000; padding:6px;">${r.satuan}</td>
              <td style="border:1px solid #000; padding:6px; text-align:right; font-weight:bold;">${r.stokAwal + r.perubahan}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:32px; text-align:center;">
        <div style="width:30%;">Dibuat Oleh,<br><br><br>( ${SESSION ? SESSION.user.nama : 'Admin'} )</div>
        <div style="width:30%;">Diperiksa Gudang,<br><br><br>( ........................... )</div>
        <div style="width:30%;">Disetujui Kepala Toko,<br><br><br>( ........................... )</div>
      </div>
    </div>
  `;

  area.classList.add('printing');
  window.print();
  area.classList.remove('printing');
}

function submitStockAdjustment(isSaveAndNew) {
  const nomor = document.getElementById('adjNomor').value.trim();
  const tanggal = document.getElementById('adjTanggal').value;
  const keterangan = document.getElementById('adjKeterangan').value.trim();

  if (!tanggal) return alert('Tanggal penyesuaian stok wajib diisi.');
  if (STOCK_ADJ_ROWS.length === 0) return alert('Isikan minimal 1 barang yang akan disesuaikan stoknya.');

  const validItems = STOCK_ADJ_ROWS.filter(r => r.perubahan !== 0);
  if (validItems.length === 0) return alert('Isi nilai Perubahan Kts (+ atau -) minimal pada satu barang.');

  const payload = {
    nomor,
    tanggal,
    keterangan,
    items: validItems.map(r => ({
      sku: r.sku,
      nama: r.nama,
      stokLama: r.stokAwal,
      perubahanQty: r.perubahan,
      stokAkhir: r.stokAwal + r.perubahan,
      satuan: r.satuan
    }))
  };

  callAdminApi('inventory/stock-adjustment', payload, res => {
    loadMasterCatalog();
    if (confirm((res.message || 'Penyesuaian stok berhasil disimpan.') + '\n\nApakah Anda ingin mencetak bukti penyesuaian stok sekarang?')) {
      printStockAdjustment();
    }
    if (isSaveAndNew) {
      resetStockAdjForm();
      document.getElementById('adjSearchInput').focus();
    } else {
      closeModal('stockAdjModal');
    }
  }, 'Menyimpan Penyesuaian Stok...');
}

// =========================================================
// MODAL 6: SET HARGA MASSAL / BERTINGKAT
// =========================================================
function openSetHargaModal() {
  resetSetHargaForm();
  document.getElementById('setHargaModal').classList.add('open');
  setTimeout(() => document.getElementById('shSearchInput').focus(), 100);
}

function resetSetHargaForm() {
  document.getElementById('shNama').value = 'PRC-' + getTodayIsoDate().replace(/-/g, '');
  document.getElementById('shUntukHarga').value = 'Reguler';
  document.getElementById('shMulaiBerlaku').value = getTodayIsoDate();
  document.getElementById('shCatatan').value = '';
  document.getElementById('shSearchInput').value = '';
  SET_HARGA_ROWS = [];
  renderSetHargaTable();
}

function clearSetHargaRows() {
  SET_HARGA_ROWS = [];
  renderSetHargaTable();
}

function getPriceByTier(prod, tier) {
  if (tier === 'Member') return Number(prod.hargaMember) || 0;
  if (tier === 'Tingkat 3') return Number(prod.hargaTingkat3) || 0;
  if (tier === 'Tingkat 4') return Number(prod.hargaTingkat4) || 0;
  if (tier === 'Tingkat 5') return Number(prod.hargaTingkat5) || 0;
  return Number(prod.hargaJual) || 0;
}

function addSetHargaItem() {
  const inp = document.getElementById('shSearchInput');
  const prod = findCatalogProduct(inp.value);
  if (!prod) {
    alert('Barang tidak ditemukan di katalog!');
    inp.focus();
    return;
  }
  const tier = document.getElementById('shUntukHarga').value;
  if (!SET_HARGA_ROWS.some(r => r.sku === prod.sku)) {
    const oldPrice = getPriceByTier(prod, tier);
    SET_HARGA_ROWS.push({
      sku: prod.sku,
      nama: prod.nama,
      hargaLama: oldPrice,
      hargaBaru: oldPrice
    });
  }
  inp.value = '';
  renderSetHargaTable();
}

function loadCategoryToSetHarga() {
  const cat = document.getElementById('masterCategoryFilter')?.value || '';
  const tier = document.getElementById('shUntukHarga').value;
  const list = MASTER_PRODUCTS_CACHE.filter(p => !cat || p.kategori === cat);
  if (list.length === 0) return alert('Tidak ada barang pada kategori terpilih.');
  list.forEach(prod => {
    if (!SET_HARGA_ROWS.some(r => r.sku === prod.sku)) {
      const oldPrice = getPriceByTier(prod, tier);
      SET_HARGA_ROWS.push({ sku: prod.sku, nama: prod.nama, hargaLama: oldPrice, hargaBaru: oldPrice });
    }
  });
  renderSetHargaTable();
}

function refreshSetHargaOldPrices() {
  const tier = document.getElementById('shUntukHarga').value;
  SET_HARGA_ROWS.forEach(r => {
    const prod = MASTER_PRODUCTS_CACHE.find(p => p.sku === r.sku);
    if (prod) {
      r.hargaLama = getPriceByTier(prod, tier);
      r.hargaBaru = r.hargaLama;
    }
  });
  renderSetHargaTable();
}

function updateSetHargaNewVal(idx, val) {
  SET_HARGA_ROWS[idx].hargaBaru = Number(val) || 0;
}

function removeSetHargaRow(idx) {
  SET_HARGA_ROWS.splice(idx, 1);
  renderSetHargaTable();
}

function renderSetHargaTable() {
  const tbody = document.getElementById('setHargaTableBody');
  if (!tbody) return;
  if (SET_HARGA_ROWS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px;">Belum ada barang dipilih untuk perubahan harga.</td></tr>';
    return;
  }
  tbody.innerHTML = SET_HARGA_ROWS.map((r, idx) => `
    <tr>
      <td><strong>${r.sku}</strong></td>
      <td>${r.nama}</td>
      <td style="text-align:right; background:#F8FAFC;">Rp ${r.hargaLama.toLocaleString('id-ID')}</td>
      <td style="text-align:right;">
        <input type="number" min="0" value="${r.hargaBaru}" onchange="updateSetHargaNewVal(${idx}, this.value)" style="width:130px; text-align:right; font-weight:700; border-color:var(--primary);">
      </td>
      <td><button type="button" class="btn btn-red btn-sm" onclick="removeSetHargaRow(${idx})">&#10006;</button></td>
    </tr>
  `).join('');
}

function submitSetHarga(isSaveAndNew) {
  const namaDokumen = document.getElementById('shNama').value.trim();
  const untukHarga = document.getElementById('shUntukHarga').value;
  const mulaiBerlaku = document.getElementById('shMulaiBerlaku').value;
  const catatan = document.getElementById('shCatatan').value.trim();

  if (SET_HARGA_ROWS.length === 0) return alert('Tambahkan minimal satu barang dalam daftar Set Harga.');

  callAdminApi('admin/save-bulk-price', {
    namaDokumen,
    untukHarga,
    mulaiBerlaku,
    catatan,
    items: SET_HARGA_ROWS
  }, res => {
    loadMasterCatalog();
    if (isSaveAndNew) {
      resetSetHargaForm();
    } else {
      closeModal('setHargaModal');
      alert(res.message || 'Set harga berhasil disimpan.');
    }
  }, 'Menyimpan Perubahan Harga...');
}

// =========================================================
// MODAL 7: PENGATURAN KOMISI PENJUALAN
// =========================================================
function openKomisiModal() {
  resetKomisiForm();
  document.getElementById('komisiModal').classList.add('open');
  setTimeout(() => document.getElementById('komNama').focus(), 100);
}

function resetKomisiForm() {
  document.getElementById('komNama').value = '';
  document.getElementById('komLevel').value = '1';
  document.getElementById('komTanggal').value = getTodayIsoDate();
  document.getElementById('komJenis').value = 'Persentase';
  document.getElementById('komCatatan').value = '';
  document.getElementById('komSearchInput').value = '';
  KOMISI_ROWS = [];
  updateKomisiTableHeader();
  renderKomisiTable();
}

function clearKomisiRows() {
  KOMISI_ROWS = [];
  renderKomisiTable();
}

function updateKomisiTableHeader() {
  const jenis = document.getElementById('komJenis').value;
  const th = document.getElementById('komBaruColHeader');
  if (th) th.textContent = jenis === 'Persentase' ? 'Komisi Baru (%)' : 'Komisi Baru (Rp)';
}

function addKomisiItem() {
  const inp = document.getElementById('komSearchInput');
  const prod = findCatalogProduct(inp.value);
  if (!prod) {
    alert('Produk/Jasa tidak ditemukan di katalog!');
    inp.focus();
    return;
  }
  if (!KOMISI_ROWS.some(r => r.sku === prod.sku)) {
    KOMISI_ROWS.push({
      sku: prod.sku,
      nama: prod.nama,
      harga: Number(prod.hargaJual) || 0,
      komisiLama: Number(prod.komisiVal) || 0,
      komisiBaru: 0
    });
  }
  inp.value = '';
  renderKomisiTable();
}

function updateKomisiNewVal(idx, val) {
  KOMISI_ROWS[idx].komisiBaru = Number(val) || 0;
}

function removeKomisiRow(idx) {
  KOMISI_ROWS.splice(idx, 1);
  renderKomisiTable();
}

function renderKomisiTable() {
  const tbody = document.getElementById('komisiTableBody');
  if (!tbody) return;
  if (KOMISI_ROWS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Belum ada produk/jasa yang dipilih untuk pengaturan komisi.</td></tr>';
    return;
  }
  tbody.innerHTML = KOMISI_ROWS.map((r, idx) => `
    <tr>
      <td><strong>${r.sku}</strong></td>
      <td>${r.nama}</td>
      <td style="text-align:right; background:#F8FAFC;">Rp ${r.harga.toLocaleString('id-ID')}</td>
      <td style="text-align:right; background:#F8FAFC;">${r.komisiLama}</td>
      <td style="text-align:right;">
        <input type="number" min="0" step="0.1" value="${r.komisiBaru}" onchange="updateKomisiNewVal(${idx}, this.value)" style="width:125px; text-align:right; font-weight:700; border-color:var(--violet);">
      </td>
      <td><button type="button" class="btn btn-red btn-sm" onclick="removeKomisiRow(${idx})">&#10006;</button></td>
    </tr>
  `).join('');
}

function submitKomisi(isSaveAndNew) {
  const namaKomisi = document.getElementById('komNama').value.trim();
  const levelKomisi = document.getElementById('komLevel').value;
  const tanggalBerlaku = document.getElementById('komTanggal').value;
  const jenisPerhitungan = document.getElementById('komJenis').value;
  const catatan = document.getElementById('komCatatan').value.trim();

  if (!namaKomisi) return alert('Nama Komisi wajib diisi!');
  if (KOMISI_ROWS.length === 0) return alert('Tambahkan minimal satu produk/jasa yang mendapatkan komisi.');

  callAdminApi('admin/save-commission', {
    namaKomisi,
    levelKomisi,
    tanggalBerlaku,
    jenisPerhitungan,
    catatan,
    items: KOMISI_ROWS
  }, res => {
    if (isSaveAndNew) {
      resetKomisiForm();
    } else {
      closeModal('komisiModal');
      alert(res.message || 'Pengaturan komisi berhasil disimpan.');
    }
  }, 'Menyimpan Aturan Komisi...');
}

// =========================================================
// MODAL 8: PROMO OTOMATIS (TIERED / BUNDLING / PWP)
// =========================================================
function openPromoModal() {
  document.getElementById('prmBarcodeSyarat').value = '';
  document.getElementById('prmMinQty').value = 1;
  document.getElementById('prmBarcodeHadiah').value = '';
  document.getElementById('prmHarga').value = '';
  document.getElementById('prmMulai').value = getTodayIsoDate();
  document.getElementById('prmSelesai').value = '';
  document.getElementById('promoModal').classList.add('open');
  setTimeout(() => document.getElementById('prmBarcodeSyarat').focus(), 100);
}

function submitPromo() {
  const payload = {
    jenisPromo: document.getElementById('prmJenis').value,
    barcodeSyarat: document.getElementById('prmBarcodeSyarat').value.trim(),
    minQty: Number(document.getElementById('prmMinQty').value) || 1,
    barcodeHadiah: document.getElementById('prmBarcodeHadiah').value.trim(),
    hargaPromo: Number(document.getElementById('prmHarga').value) || 0,
    tglMulai: document.getElementById('prmMulai').value,
    tglSelesai: document.getElementById('prmSelesai').value
  };
  if (!payload.barcodeSyarat) return alert('Barcode / SKU Syarat wajib diisi.');

  callAdminApi('admin/save-promo', payload, res => {
    closeModal('promoModal');
    alert(res.message);
  }, 'Menyimpan Aturan Promo...');
}

// === MEMBER & PIUTANG PELANGGAN (MODAL & FILTER) ===
function openMemberModal() {
  resetMemberForm();
  const titleEl = document.getElementById('memberModalTitle');
  if (titleEl) titleEl.textContent = 'Tambah Pelanggan Baru';
  document.getElementById('memberModal').classList.add('open');
  setTimeout(() => document.getElementById('mbrNama').focus(), 100);
}

function switchMemberSubTab(subName, btn) {
  document.querySelectorAll('.mbr-subtab-panel').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.mbr-subtab-btn').forEach(b => {
    b.classList.remove('btn-blue');
    b.classList.add('btn-dark');
  });
  const target = document.getElementById('mbr-subtab-' + subName);
  if (target) target.style.display = 'block';
  if (btn) {
    btn.classList.remove('btn-dark');
    btn.classList.add('btn-blue');
  }
}

function promptMemberPhotoUrl() {
  const cur = document.getElementById('mbrPhotoUrl').value || '';
  const url = prompt('Masukkan URL Foto Pelanggan (HTTPS):', cur);
  if (url === null) return;
  document.getElementById('mbrPhotoUrl').value = url.trim();
  renderMemberPhotoPreview(url.trim());
}

function clearMemberPhotoUrl() {
  document.getElementById('mbrPhotoUrl').value = '';
  renderMemberPhotoPreview('');
}

function renderMemberPhotoPreview(url) {
  const box = document.getElementById('mbrPhotoPreview');
  if (!box) return;
  box.innerHTML = url
    ? `<img src="${url}" alt="Foto" style="max-width:100%; max-height:140px; object-fit:contain;" onerror="this.parentElement.innerHTML='Foto gagal dimuat'">`
    : 'Tidak ada foto';
}

function resetMemberForm() {
  document.getElementById('mbrId').value = '';
  document.getElementById('mbrKategori').value = 'Umum';
  document.getElementById('mbrCardCode').value = '';
  document.getElementById('mbrNama').value = '';
  document.getElementById('mbrGender').value = '-';
  document.getElementById('mbrBirthDate').value = '';
  document.getElementById('mbrKtp').value = '';
  document.getElementById('mbrContactName').value = '';
  document.getElementById('mbrPhone').value = '';
  document.getElementById('mbrEmail').value = '';
  document.getElementById('mbrAddress1').value = '';
  document.getElementById('mbrAddress2').value = '';
  document.getElementById('mbrPostalCode').value = '';
  document.getElementById('mbrCity').value = '';
  document.getElementById('mbrProvince').value = '';
  document.getElementById('mbrLevel').value = 'Reguler';
  document.getElementById('mbrDiscountPct').value = 0;
  document.getElementById('mbrCreditLimit').value = 0;
  document.getElementById('mbrDueDays').value = 14;
  document.getElementById('mbrNotes').value = '';
  clearMemberPhotoUrl();
  const firstTab = document.querySelector('.mbr-subtab-btn');
  if (firstTab) switchMemberSubTab('info', firstTab);
}

function loadMembersTable() {
  const cachedMbr = getAdminCache('MEMBERS');
  if (cachedMbr && Array.isArray(cachedMbr)) {
    MEMBERS_CACHE = cachedMbr;
    filterMembersTable();
  }

  callAdminApi('member/list', {}, members => {
    MEMBERS_CACHE = members || [];
    setAdminCache('MEMBERS', MEMBERS_CACHE);
    filterMembersTable();
  }, 'Memuat Data Pelanggan & Piutang...', Boolean(cachedMbr));
}

function filterMembersTable() {
  const q = (document.getElementById('memberSearchInput')?.value || '').toLowerCase().trim();
  const cat = (document.getElementById('memberCategoryFilter')?.value || '').trim();
  const debtOnly = document.getElementById('memberDebtOnlyFilter')?.checked || false;

  const filtered = MEMBERS_CACHE.filter(m => {
    const matchText = !q ||
      String(m.member_id || '').toLowerCase().includes(q) ||
      String(m.card_code || '').toLowerCase().includes(q) ||
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.phone || '').toLowerCase().includes(q);
    const matchCat = !cat || (m.kategori || 'Umum') === cat;
    const matchDebt = !debtOnly || (Number(m.current_debt) || 0) > 0;
    return matchText && matchCat && matchDebt;
  });

  renderMembersTable(filtered);
}

function renderMembersTable(members) {
  const tbody = document.getElementById('membersTableBody');
  const totalPiutang = members.reduce((sum, m) => sum + (Number(m.current_debt) || 0), 0);
  const badge = document.getElementById('totalPiutangBadge');
  if (badge) badge.textContent = 'Rp ' + totalPiutang.toLocaleString('id-ID');

  if (!tbody) return;
  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:20px;">Data pelanggan tidak ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = members.map(m => `
    <tr>
      <td><strong>${m.member_id}</strong></td>
      <td><code>${m.card_code}</code></td>
      <td>${m.name}</td>
      <td><span class="badge badge-warn">${m.kategori || 'Umum'}</span></td>
      <td>${m.phone || '-'}</td>
      <td><span class="badge badge-ok">${m.price_level || 'Reguler'}</span></td>
      <td>${Number(m.member_discount_pct) || 0}%</td>
      <td><strong>${(Number(m.points) || 0).toLocaleString('id-ID')}</strong> pt</td>
      <td>Rp ${(Number(m.credit_limit) || 0).toLocaleString('id-ID')}</td>
      <td style="color:${Number(m.current_debt) > 0 ? '#DC2626' : '#0F172A'}; font-weight:700;">
        Rp ${(Number(m.current_debt) || 0).toLocaleString('id-ID')}
      </td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-blue btn-sm" onclick='fillMemberForm(${JSON.stringify(m)})'>Edit</button>
        ${Number(m.current_debt) > 0 ? `<button class="btn btn-amber btn-sm" onclick="openPayDebtModal('${m.member_id}')">Bayar Piutang</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function fillMemberForm(m) {
  resetMemberForm();
  const titleEl = document.getElementById('memberModalTitle');
  if (titleEl) titleEl.textContent = `Edit Pelanggan: ${m.name}`;

  document.getElementById('mbrId').value = m.member_id || '';
  document.getElementById('mbrKategori').value = m.kategori || 'Umum';
  document.getElementById('mbrCardCode').value = m.card_code || '';
  document.getElementById('mbrNama').value = m.name || '';
  document.getElementById('mbrGender').value = m.gender || '-';
  document.getElementById('mbrBirthDate').value = m.birth_date || '';
  document.getElementById('mbrKtp').value = m.ktp || '';
  document.getElementById('mbrContactName').value = m.contact_name || '';
  document.getElementById('mbrPhone').value = m.phone || '';
  document.getElementById('mbrEmail').value = m.email || '';
  document.getElementById('mbrAddress1').value = m.address1 || '';
  document.getElementById('mbrAddress2').value = m.address2 || '';
  document.getElementById('mbrPostalCode').value = m.postal_code || '';
  document.getElementById('mbrCity').value = m.city || '';
  document.getElementById('mbrProvince').value = m.province || '';
  document.getElementById('mbrLevel').value = m.price_level || 'Reguler';
  document.getElementById('mbrDiscountPct').value = Number(m.member_discount_pct) || 0;
  document.getElementById('mbrCreditLimit').value = Number(m.credit_limit) || 0;
  document.getElementById('mbrDueDays').value = Number(m.due_days) || 14;
  document.getElementById('mbrNotes').value = m.notes || '';
  document.getElementById('mbrPhotoUrl').value = m.photo_url || '';
  renderMemberPhotoPreview(m.photo_url || '');

  document.getElementById('memberModal').classList.add('open');
  setTimeout(() => document.getElementById('mbrNama').focus(), 100);
}

function submitMemberAdmin(isSaveAndNew) {
  const payload = {
    memberId: document.getElementById('mbrId').value.trim(),
    kategori: document.getElementById('mbrKategori').value,
    cardCode: document.getElementById('mbrCardCode').value.trim(),
    nama: document.getElementById('mbrNama').value.trim(),
    gender: document.getElementById('mbrGender').value,
    birthDate: document.getElementById('mbrBirthDate').value,
    ktp: document.getElementById('mbrKtp').value.trim(),
    contactName: document.getElementById('mbrContactName').value.trim(),
    phone: document.getElementById('mbrPhone').value.trim(),
    email: document.getElementById('mbrEmail').value.trim(),
    address1: document.getElementById('mbrAddress1').value.trim(),
    address2: document.getElementById('mbrAddress2').value.trim(),
    postalCode: document.getElementById('mbrPostalCode').value.trim(),
    city: document.getElementById('mbrCity').value.trim(),
    province: document.getElementById('mbrProvince').value.trim(),
    priceLevel: document.getElementById('mbrLevel').value,
    discountPct: Number(document.getElementById('mbrDiscountPct').value) || 0,
    creditLimit: Number(document.getElementById('mbrCreditLimit').value) || 0,
    dueDays: Number(document.getElementById('mbrDueDays').value) || 14,
    notes: document.getElementById('mbrNotes').value.trim(),
    photoUrl: document.getElementById('mbrPhotoUrl').value.trim()
  };

  if (!payload.nama) return alert('Nama Pelanggan wajib diisi!');

  callAdminApi('member/save', payload, res => {
    loadMembersTable();
    if (isSaveAndNew) {
      resetMemberForm();
      const titleEl = document.getElementById('memberModalTitle');
      if (titleEl) titleEl.textContent = 'Tambah Pelanggan Baru';
      document.getElementById('mbrNama').focus();
    } else {
      closeModal('memberModal');
      alert(res.message);
    }
  }, 'Menyimpan Data Pelanggan...');
}

function openPayDebtModal(preselectMemberId) {
  const debtors = MEMBERS_CACHE.filter(m => (Number(m.current_debt) || 0) > 0);
  if (debtors.length === 0) {
    return alert('Saat ini tidak ada pelanggan yang memiliki tagihan piutang.');
  }

  const sel = document.getElementById('debtMemberSelect');
  sel.innerHTML = debtors.map(m =>
    `<option value="${m.member_id}" data-debt="${m.current_debt}">${m.member_id} - ${m.name} (Piutang: Rp ${Number(m.current_debt).toLocaleString('id-ID')})</option>`
  ).join('');

  if (preselectMemberId) sel.value = preselectMemberId;
  document.getElementById('debtPayDate').value = getTodayIsoDate();
  document.getElementById('debtPayNote').value = '';
  onSelectDebtMember();

  document.getElementById('payDebtModal').classList.add('open');
}

function onSelectDebtMember() {
  const sel = document.getElementById('debtMemberSelect');
  const opt = sel.options[sel.selectedIndex];
  const debt = opt ? (Number(opt.dataset.debt) || 0) : 0;
  document.getElementById('debtCurrentAmountText').textContent = 'Rp ' + debt.toLocaleString('id-ID');
  document.getElementById('debtPayAmount').value = debt;
}

function submitPayMemberDebt() {
  const memberId = document.getElementById('debtMemberSelect').value;
  const amountPaid = Number(document.getElementById('debtPayAmount').value) || 0;
  const payDate = document.getElementById('debtPayDate').value;
  const method = document.getElementById('debtPayMethod').value;
  const rawNote = document.getElementById('debtPayNote').value.trim();

  if (amountPaid <= 0) return alert('Nominal pembayaran piutang tidak valid.');

  const note = `[${payDate} | ${method}] ${rawNote || 'Pelunasan Piutang'}`;
  callAdminApi('member/pay-debt', { memberId, amountPaid, note }, res => {
    closeModal('payDebtModal');
    alert(res.message);
    loadMembersTable();
  }, 'Memproses Pelunasan Piutang...');
}

function printMemberList() {
  window.print();
}

// === SUPPLIER, PEMBELIAN LPB & HUTANG USAHA ===
function renderSuppliersListUI(suppliers) {
  const sel = document.getElementById('purSupplierId');
  if (sel) {
    sel.innerHTML = suppliers.map(s => `<option value="${s.supplier_id}">${s.supplier_id} - ${s.nama_supplier}</option>`).join('');
  }

  const tbody = document.getElementById('suppliersTableBody');
  if (tbody) {
    tbody.innerHTML = suppliers.map(s => `
      <tr>
        <td><strong>${s.supplier_id}</strong></td>
        <td>${s.nama_supplier}<br><small style="color:#64748B;">${s.alamat}</small></td>
        <td>${s.kontak_hp}</td>
        <td>${s.termin_hari} Hari</td>
        <td style="color:${s.saldo_hutang > 0 ? '#DC2626' : '#0F172A'}; font-weight:700;">
          Rp ${s.saldo_hutang.toLocaleString('id-ID')}
        </td>
        <td style="display:flex; gap:6px;">
          <button class="btn btn-blue btn-sm" onclick='fillSupplierForm(${JSON.stringify(s)})'>Edit</button>
          ${s.saldo_hutang > 0 ? `<button class="btn btn-amber btn-sm" onclick="paySupplierDebtModal('${s.supplier_id}', '${s.nama_supplier}', ${s.saldo_hutang})">Bayar Hutang</button>` : ''}
        </td>
      </tr>
    `).join('');
  }
}

function loadSuppliersTable() {
  const cachedSup = getAdminCache('SUPPLIERS');
  if (cachedSup && Array.isArray(cachedSup)) {
    GUDANG_SUPPLIERS_CACHE = cachedSup;
    renderSuppliersListUI(cachedSup);
  }

  callAdminApi('supplier/list', {}, suppliers => {
    GUDANG_SUPPLIERS_CACHE = suppliers || [];
    setAdminCache('SUPPLIERS', GUDANG_SUPPLIERS_CACHE);
    renderSuppliersListUI(GUDANG_SUPPLIERS_CACHE);
  }, 'Memuat Data Supplier...', Boolean(cachedSup));
}

function fillSupplierForm(s) {
  document.getElementById('supId').value = s.supplier_id;
  document.getElementById('supNama').value = s.nama_supplier;
  document.getElementById('supHp').value = s.kontak_hp;
  document.getElementById('supAlamat').value = s.alamat;
  document.getElementById('supTermin').value = s.termin_hari;
}

function submitSupplier() {
  callAdminApi('supplier/save', {
    supplierId: document.getElementById('supId').value,
    namaSupplier: document.getElementById('supNama').value,
    kontakHp: document.getElementById('supHp').value,
    alamat: document.getElementById('supAlamat').value,
    terminHari: Number(document.getElementById('supTermin').value) || 0
  }, res => {
    alert(res.message);
    document.getElementById('supId').value = '';
    document.getElementById('supNama').value = '';
    loadSuppliersTable();
  }, 'Menyimpan Data Supplier...');
}

function submitPurchaseInvoice() {
  callAdminApi('supplier/purchase', {
    supplierId: document.getElementById('purSupplierId').value,
    noFaktur: document.getElementById('purNoFaktur').value,
    paymentMethod: document.getElementById('purPayMethod').value,
    sku: document.getElementById('purSku').value,
    qty: Number(document.getElementById('purQty').value) || 0,
    buyPrice: Number(document.getElementById('purBuyPrice').value) || 0
  }, res => {
    alert(res.message);
    document.getElementById('purNoFaktur').value = '';
    document.getElementById('purSku').value = '';
    document.getElementById('purQty').value = '';
    document.getElementById('purBuyPrice').value = '';
    loadSuppliersTable();
  }, 'Menyimpan Faktur Pembelian...');
}

function paySupplierDebtModal(supplierId, supplierName, curDebt) {
  const amtStr = prompt(`PELUNASAN HUTANG SUPPLIER\nSupplier: ${supplierName}\nSisa Hutang: Rp ${curDebt.toLocaleString('id-ID')}\n\nNominal dibayarkan (Rp):`, curDebt);
  if (!amtStr) return;
  const amountPaid = Number(amtStr) || 0;
  if (amountPaid <= 0) return alert('Nominal pembayaran tidak valid.');

  const note = prompt('Nomor Referensi Transfer / Bukti Kas Keluar:', 'Transfer Bank') || '-';
  callAdminApi('supplier/pay-debt', { supplierId, amountPaid, note }, res => {
    alert(res.message);
    loadSuppliersTable();
  }, 'Memproses Pembayaran Hutang...');
}

// === JEMBATAN KE MODUL LAPORAN BARU (JS/js_report.js) ===
function initAndLoadReport() {
  if (typeof initReportModule === 'function') {
    initReportModule();
  }
}

// === GUDANG & MUTASI ANTAR TOKO ===
function openGudangDocModal() {
  document.getElementById('docAsal').value = '';
  document.getElementById('docPin').value = '';
  document.getElementById('docSku').value = '';
  document.getElementById('docQty').value = '';
  document.getElementById('docExpired').value = '';
  document.getElementById('gudangDocModal').classList.add('open');
  setTimeout(() => document.getElementById('docAsal').focus(), 100);
}

function openRepackModal() {
  document.getElementById('repSrcSku').value = '';
  document.getElementById('repTgtSku').value = '';
  document.getElementById('repPin').value = '';
  document.getElementById('repQtySrc').value = '';
  document.getElementById('repFactor').value = '';
  updateRepackPreview();
  document.getElementById('repackModal').classList.add('open');
  setTimeout(() => document.getElementById('repSrcSku').focus(), 100);
}

function submitGudangDoc() {
  const payload = {
    tipe: document.getElementById('docTipe').value,
    asalTujuan: document.getElementById('docAsal').value,
    supervisorPin: document.getElementById('docPin').value,
    items: [{
      sku: document.getElementById('docSku').value.trim().toUpperCase(),
      qty: Number(document.getElementById('docQty').value),
      expiredDate: document.getElementById('docExpired').value
    }]
  };
  callAdminApi('inventory/lpb-nrb', payload, res => {
    alert(res.message);
    document.getElementById('docSku').value = '';
    document.getElementById('docQty').value = '';
  }, 'Memproses Dokumen Gudang...');
}

function updateRepackPreview() {
  const qty = Number(document.getElementById('repQtySrc').value) || 0;
  const factor = Number(document.getElementById('repFactor').value) || 0;
  const total = qty * factor;
  const box = document.getElementById('repPreviewBox');
  if (box) box.textContent = `Hasil Eceran: +${total.toLocaleString('id-ID')} Pcs`;
}

function submitRepackUnit() {
  const payload = {
    sourceSku: document.getElementById('repSrcSku').value.trim().toUpperCase(),
    targetSku: document.getElementById('repTgtSku').value.trim().toUpperCase(),
    qtySource: Number(document.getElementById('repQtySrc').value) || 0,
    conversionFactor: Number(document.getElementById('repFactor').value) || 0,
    supervisorPin: document.getElementById('repPin').value
  };
  callAdminApi('inventory/repack', payload, res => {
    alert(res.message);
    document.getElementById('repSrcSku').value = '';
    document.getElementById('repTgtSku').value = '';
    document.getElementById('repQtySrc').value = '';
    document.getElementById('repFactor').value = '';
    updateRepackPreview();
  }, 'Memproses Konversi Satuan...');
}

// === BLIND STOCK OPNAME + ROLE-BASED SYSTEM STOCK TOGGLE & VARIANCE REPORT ===
let SO_SHOW_SYSTEM_STOCK = false;
let SO_ITEMS_CACHE = [];

function canViewSystemStockInSO() {
  if (!SESSION || !SESSION.user || !SESSION.user.role) return false;
  const role = String(SESSION.user.role).toLowerCase();
  return role.includes('owner') || role.includes('korwil') || role.includes('kepala') || role.includes('supervisor') || role.includes('admin');
}

function toggleSystemStockInSO() {
  if (!canViewSystemStockInSO()) {
    return alert('Akses ditolak: Hanya Owner, Korwil, atau Kepala Toko yang dapat melihat stok komputer saat SO.');
  }
  SO_SHOW_SYSTEM_STOCK = !SO_SHOW_SYSTEM_STOCK;
  applySOColumnsVisibility();
}

function applySOColumnsVisibility() {
  const allowed = canViewSystemStockInSO();
  const toggleBtn = document.getElementById('btnToggleSystemStockSO');
  if (toggleBtn) {
    toggleBtn.style.display = allowed ? 'inline-flex' : 'none';
    toggleBtn.innerHTML = SO_SHOW_SYSTEM_STOCK
      ? '&#128584; Sembunyikan Stok Sistem (Blind Mode)'
      : '&#128065;&#65039; Tampilkan Stok Sistem';
    toggleBtn.classList.toggle('btn-amber', SO_SHOW_SYSTEM_STOCK);
    toggleBtn.classList.toggle('btn-dark', !SO_SHOW_SYSTEM_STOCK);
  }

  const showCols = allowed && SO_SHOW_SYSTEM_STOCK;
  document.querySelectorAll('.so-sys-col').forEach(el => {
    el.style.display = showCols ? 'table-cell' : 'none';
  });
}

function renderSOTableRows(items) {
  const tbody = document.getElementById('soTableBody');
  if (!tbody) return;

  const catalogMap = {};
  (MASTER_PRODUCTS_CACHE || getAdminCache('PRODUCTS') || []).forEach(p => {
    catalogMap[String(p.sku).toUpperCase()] = p;
  });

  tbody.innerHTML = items.map(item => {
    const skuKey = String(item.sku).toUpperCase();
    const prod = catalogMap[skuKey] || {};
    const sysStock = item.stokGood != null
      ? Number(item.stokGood)
      : (prod.stokTerkini != null ? Number(prod.stokTerkini) : (Number(prod.saldoAwal) || 0));
    const hpp = Number(prod.hargaModal) || 0;

    return `
      <tr id="so-row-${item.sku}" class="so-data-row" data-search="${(item.sku + ' ' + item.barcode + ' ' + item.nama).toLowerCase()}">
        <td><strong>${item.sku}</strong></td>
        <td><code>${item.barcode}</code></td>
        <td>${item.nama}</td>
        <td>${item.satuan}</td>
        <td class="so-sys-col" style="display:none; text-align:right; font-weight:700; background:#EFF6FF; color:#1E40AF;">${sysStock}</td>
        <td>
          <input type="number" class="so-input"
            data-sku="${item.sku}"
            data-barcode="${item.barcode}"
            data-nama="${item.nama}"
            data-sys="${sysStock}"
            data-hpp="${hpp}"
            oninput="updateSORowVariance(this)"
            placeholder="0" style="width:110px;">
        </td>
        <td id="so-diff-${item.sku}" class="so-sys-col" style="display:none; text-align:right; font-weight:700; background:#FFFBEB;">-</td>
      </tr>
    `;
  }).join('');

  applySOColumnsVisibility();
}

function updateSORowVariance(inp) {
  const diffEl = document.getElementById('so-diff-' + inp.dataset.sku);
  if (!diffEl) return;
  if (inp.value === '') {
    diffEl.textContent = '-';
    diffEl.style.color = 'var(--text-muted)';
    return;
  }
  const fisik = Number(inp.value) || 0;
  const sys = Number(inp.dataset.sys) || 0;
  const diff = fisik - sys;
  diffEl.textContent = diff > 0 ? `+${diff}` : String(diff);
  diffEl.style.color = diff === 0 ? 'var(--primary)' : (diff < 0 ? 'var(--red)' : '#D97706');
}

function filterSOTableRows() {
  const q = (document.getElementById('soFilterText')?.value || '').toLowerCase().trim();
  document.querySelectorAll('.so-data-row').forEach(row => {
    const hay = row.dataset.search || '';
    row.style.display = (!q || hay.includes(q)) ? '' : 'none';
  });
}

function loadBlindSOItems() {
  SO_SHOW_SYSTEM_STOCK = false;

  if (!MASTER_PRODUCTS_CACHE || MASTER_PRODUCTS_CACHE.length === 0) {
    const cachedProd = getAdminCache('PRODUCTS');
    if (cachedProd) MASTER_PRODUCTS_CACHE = cachedProd;
  }

  const cachedSO = getAdminCache('SO_ITEMS');
  const hasCache = Boolean(cachedSO && Array.isArray(cachedSO) && cachedSO.length > 0);
  if (hasCache) {
    SO_ITEMS_CACHE = cachedSO;
    renderSOTableRows(SO_ITEMS_CACHE);
  }

  callAdminApi('inventory/stok-toko', { blindMode: !canViewSystemStockInSO() }, items => {
    SO_ITEMS_CACHE = items || [];
    setAdminCache('SO_ITEMS', SO_ITEMS_CACHE);
    renderSOTableRows(SO_ITEMS_CACHE);
    const scanInp = document.getElementById('soScannerInput');
    if (scanInp) scanInp.focus();
  }, 'Memuat Daftar Stock Opname...', hasCache);
}

function handleSOScannerKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const code = e.target.value.trim();
  if (!code) return;

  let matchedInp = null;
  document.querySelectorAll('.so-input').forEach(inp => {
    const barcodes = String(inp.dataset.barcode || '').split(',').map(b => b.trim());
    if (inp.dataset.sku.toLowerCase() === code.toLowerCase() || barcodes.includes(code)) {
      matchedInp = inp;
    }
  });

  const fb = document.getElementById('soScannerFeedback');
  if (matchedInp) {
    const curVal = Number(matchedInp.value) || 0;
    matchedInp.value = curVal + 1;
    updateSORowVariance(matchedInp);

    const row = document.getElementById('so-row-' + matchedInp.dataset.sku);
    if (row) {
      row.style.display = '';
      row.style.background = '#ECFDF5';
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    fb.style.color = 'var(--primary)';
    fb.textContent = `+1 ${matchedInp.dataset.nama} (Total Fisik: ${matchedInp.value})`;
  } else {
    fb.style.color = 'var(--red)';
    fb.textContent = `Barcode "${code}" tidak ditemukan di daftar SO!`;
  }
  e.target.value = '';
}

function submitSO() {
  const counts = [];
  const nameMap = {};

  document.querySelectorAll('.so-input').forEach(inp => {
    if (inp.value !== '') {
      counts.push({ sku: inp.dataset.sku, stokFisik: Number(inp.value) || 0 });
      nameMap[inp.dataset.sku] = inp.dataset.nama;
    }
  });

  if (counts.length === 0) return alert('Isi minimal satu hitungan fisik barang.');

  const jenisSO = document.getElementById('jenisSO').value;
  callAdminApi('inventory/stock-opname', {
    jenisSO: jenisSO,
    supervisorPin: document.getElementById('soPin').value,
    counts: counts
  }, res => {
    const serverRows = (res.summary || []).map(r => ({
      sku: r.sku,
      nama: nameMap[r.sku] || r.sku,
      sys: Number(r.stokKomputer) || 0,
      fisik: Number(r.stokFisik) || 0,
      selisih: Number(r.selisih) || 0,
      nilaiSelisih: Number(r.nilaiSelisih) || 0
    }));

    callAdminApi('admin/products', {}, items => {
      MASTER_PRODUCTS_CACHE = items || [];
      setAdminCache('PRODUCTS', MASTER_PRODUCTS_CACHE);
      loadBlindSOItems();
    }, '', true);

    showSOSummaryModal(jenisSO, serverRows, res.idSO || res.message);
  }, 'Menyimpan Hasil Stock Opname...');
}

function showSOSummaryModal(jenisSO, rows, serverMsg) {
  const totalSku = rows.length;
  const matchCount = rows.filter(r => r.selisih === 0).length;
  const diffCount = totalSku - matchCount;
  const totalDiffValue = rows.reduce((sum, r) => sum + r.nilaiSelisih, 0);

  document.getElementById('soSummarySubtitle').textContent =
    `${jenisSO === 'GRAND' ? 'Grand Stock Opname' : 'SO Parsial Harian'} • ${formatIndoDate(getTodayIsoDate())} • Petugas: ${SESSION ? SESSION.user.nama : '-'}`;

  document.getElementById('soSumTotalSku').textContent = `${totalSku} SKU`;
  document.getElementById('soSumMatchCount').textContent = `${matchCount} SKU`;
  document.getElementById('soSumDiffCount').textContent = `${diffCount} SKU`;

  const valEl = document.getElementById('soSumDiffValue');
  valEl.textContent = (totalDiffValue > 0 ? '+Rp ' : (totalDiffValue < 0 ? '-Rp ' : 'Rp ')) + Math.abs(totalDiffValue).toLocaleString('id-ID');
  valEl.style.color = totalDiffValue < 0 ? '#DC2626' : (totalDiffValue > 0 ? '#059669' : '#B45309');

  const tbody = document.getElementById('soSummaryTableBody');
  tbody.innerHTML = rows.map(r => {
    let badge = '<span class="badge badge-ok">Cocok</span>';
    if (r.selisih < 0) badge = `<span class="badge badge-danger">Kurang (${r.selisih})</span>`;
    else if (r.selisih > 0) badge = `<span class="badge badge-warn">Lebih (+${r.selisih})</span>`;

    const rpText = r.nilaiSelisih === 0
      ? 'Rp 0'
      : `${r.nilaiSelisih > 0 ? '+' : '-'}Rp ${Math.abs(r.nilaiSelisih).toLocaleString('id-ID')}`;

    return `
      <tr style="${r.selisih !== 0 ? 'background:#FFFBEB;' : ''}">
        <td><strong>${r.sku}</strong></td>
        <td>${r.nama}</td>
        <td style="text-align:right;">${r.sys}</td>
        <td style="text-align:right; font-weight:700;">${r.fisik}</td>
        <td style="text-align:right; font-weight:800; color:${r.selisih < 0 ? '#DC2626' : (r.selisih > 0 ? '#D97706' : '#059669')};">
          ${r.selisih > 0 ? '+' + r.selisih : r.selisih}
        </td>
        <td style="text-align:right; font-weight:700;">${rpText}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('soSummaryModal').classList.add('open');
}

function printSOSummaryReport() {
  const area = document.getElementById('soSummaryPrintArea');
  if (!area) return window.print();
  area.classList.add('printing');
  window.print();
  area.classList.remove('printing');
}

// === BRANKAS ===
function submitKasBrankas() {
  callAdminApi('finance/cash-flow', {
    jenis: document.getElementById('kasJenis').value,
    nominal: Number(document.getElementById('kasNominal').value),
    keterangan: document.getElementById('kasKet').value
  }, res => {
    alert(res.message);
    document.getElementById('kasNominal').value = '';
    document.getElementById('kasKet').value = '';
  }, 'Menyimpan Transaksi Brankas...');
}

let BRANKAS_LOGS_CACHE = [];

async function loadBrankasHistory() {
  const tbody = document.getElementById('brankasTableBody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:16px;">Memuat data kas brankas...</td></tr>';
  }

  let serverLogs = [];
  try {
    const res = await callAdminApi('finance/kas-list', { kode_toko: getActiveTokoCode() });
    if (res && res.status === 'success' && Array.isArray(res.data)) {
      serverLogs = res.data;
    } else {
      const dash = await callAdminApi('finance/dashboard', { kode_toko: getActiveTokoCode() });
      const audits = (dash && dash.data && Array.isArray(dash.data.recent_audits)) ? dash.data.recent_audits : [];
      serverLogs = audits
        .filter(a => String(a.aktivitas || a.action || '').toUpperCase().includes('BRANKAS') ||
                     String(a.aktivitas || a.action || '').toUpperCase().includes('CASH_DROP') ||
                     String(a.aktivitas || a.action || '').toUpperCase().includes('SETOR'))
        .map(a => ({
          waktu: a.waktu || a.timestamp || '-',
          jenis: a.jenis || (String(a.aktivitas || '').includes('DROP') ? 'CASH_DROP' : 'SETOR_BANK'),
          keterangan: a.keterangan || a.detail || '-',
          nominal: Number(a.nominal || 0),
          petugas: a.user || a.petugas || 'Admin'
        }));
    }
  } catch (e) {}

  const localKey = 'DANISH_BRANKAS_LOGS_' + getActiveTokoCode();
  let localLogs = [];
  try {
    localLogs = JSON.parse(localStorage.getItem(localKey) || '[]');
  } catch (e) {}

  BRANKAS_LOGS_CACHE = serverLogs.length ? serverLogs : localLogs;
  renderBrankasHistoryTable();
}

function renderBrankasHistoryTable() {
  const tbody = document.getElementById('brankasTableBody');
  const filterVal = document.getElementById('brankasFilterJenis')?.value || 'ALL';
  if (!tbody) return;

  let totalDrop = 0;
  let totalOut = 0;

  BRANKAS_LOGS_CACHE.forEach(item => {
    const nom = Number(item.nominal || 0);
    const jns = String(item.jenis || '').toUpperCase();
    if (jns === 'CASH_DROP') totalDrop += nom;
    else totalOut += nom;
  });

  const elDrop = document.getElementById('brankasTotalDrop');
  const elOut = document.getElementById('brankasTotalOut');
  const elNet = document.getElementById('brankasSaldoNet');
  if (elDrop) elDrop.textContent = 'Rp ' + totalDrop.toLocaleString('id-ID');
  if (elOut) elOut.textContent = 'Rp ' + totalOut.toLocaleString('id-ID');
  if (elNet) elNet.textContent = 'Rp ' + (totalDrop - totalOut).toLocaleString('id-ID');

  const filtered = filterVal === 'ALL'
    ? BRANKAS_LOGS_CACHE
    : BRANKAS_LOGS_CACHE.filter(x => String(x.jenis || '').toUpperCase() === filterVal);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:24px;">Belum ada catatan transaksi brankas.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(row => {
    const jns = String(row.jenis || '').toUpperCase();
    const isIn = jns === 'CASH_DROP';
    const badgeHtml = isIn
      ? '<span class="badge badge-ok">Cash Drop (+)</span>'
      : (jns === 'SETOR_BANK'
          ? '<span class="badge badge-warn">Setor Bank (-)</span>'
          : '<span class="badge badge-danger">Biaya Ops (-)</span>');
    const nomText = (isIn ? '+ ' : '- ') + 'Rp ' + Number(row.nominal || 0).toLocaleString('id-ID');
    const nomColor = isIn ? '#059669' : '#DC2626';

    return `
      <tr>
        <td style="white-space:nowrap;">${row.waktu || '-'}</td>
        <td>${badgeHtml}</td>
        <td>${row.keterangan || '-'}</td>
        <td style="text-align:right; font-weight:700; color:${nomColor}; white-space:nowrap;">${nomText}</td>
        <td>${row.petugas || 'Admin'}</td>
      </tr>
    `;
  }).join('');
}

// === MANAJEMEN USER & DEVICE BINDING ===
function renderUsersListUI(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.idUser}</strong></td>
      <td>${u.nama}</td>
      <td>${u.username}</td>
      <td><span class="badge badge-ok">${u.role}</span></td>
      <td>${u.aksesToko}</td>
      <td><code>${u.deviceId}</code></td>
      <td style="display:flex; gap:6px;">
        <button class="btn btn-blue btn-sm" onclick="bindUserDevice('${u.idUser}', '${u.deviceId}')">Set Device</button>
        <button class="btn btn-red btn-sm" onclick="resetUserDevice('${u.idUser}')">Reset</button>
      </td>
    </tr>
  `).join('');
}

function loadUsersTable() {
  const cachedUsr = getAdminCache('USERS');
  if (cachedUsr && Array.isArray(cachedUsr)) {
    renderUsersListUI(cachedUsr);
  }

  callAdminApi('admin/users', {}, users => {
    setAdminCache('USERS', users || []);
    renderUsersListUI(users || []);
  }, 'Memuat Daftar Pengguna...', Boolean(cachedUsr));
}

function submitNewUser() {
  const payload = {
    nama: document.getElementById('usrNama').value,
    username: document.getElementById('usrUsername').value,
    password: document.getElementById('usrPassword').value,
    pin: document.getElementById('usrPin').value,
    role: document.getElementById('usrRole').value,
    aksesToko: document.getElementById('usrToko').value || SESSION.store.kodeToko
  };
  callAdminApi('admin/create-user', payload, res => {
    alert(res.message);
    document.getElementById('usrNama').value = '';
    document.getElementById('usrUsername').value = '';
    document.getElementById('usrPassword').value = '';
    document.getElementById('usrPin').value = '';
    loadUsersTable();
  }, 'Menyimpan Pengguna Baru...');
}

function bindUserDevice(targetUserId, currentDev) {
  const newDev = prompt(`Masukkan Device ID baru untuk ${targetUserId}\n(Kosongkan atau ketik ANY untuk bebas perangkat):`, currentDev);
  if (newDev === null) return;
  callAdminApi('security/device-binding', { targetUserId, newDeviceId: newDev }, () => {
    alert('Device binding berhasil diperbarui.');
    loadUsersTable();
  }, 'Memperbarui Device Binding...');
}

function resetUserDevice(targetUserId) {
  if (!confirm(`Lepas kunci perangkat (UNBOUND) untuk user ${targetUserId}?`)) return;
  callAdminApi('security/device-binding', { targetUserId, newDeviceId: 'UNBOUND' }, () => {
    alert('Perangkat user berhasil di-reset ke UNBOUND.');
    loadUsersTable();
  }, 'Mereset Device User...');
}

function goKasir() {
  window.location.href = 'kasir.html';
}

function logout() {
  localStorage.removeItem('POS_SESSION');
  window.location.href = 'login.html';
}

/* ============================================================================
   MODUL GUDANG, PEMASOK & PENERIMAAN BARANG (MULTI-ITEM)
   ============================================================================ */

let pbItemsList = [];

function openPemasokModal() {
  document.getElementById('pmsId').value = '';
  document.getElementById('pmsNama').value = '';
  document.getElementById('pmsTelepon').value = '';
  document.getElementById('pmsFaks').value = '';
  document.getElementById('pmsKontak').value = '';
  document.getElementById('pmsAlamat1').value = '';
  document.getElementById('pmsAlamat2').value = '';
  document.getElementById('pmsKota').value = '';
  document.getElementById('pmsPropinsi').value = '';
  document.getElementById('pmsCatatan').value = '';

  const modal = document.getElementById('pemasokModal');
  if (modal) modal.classList.add('open');
  setTimeout(() => document.getElementById('pmsNama').focus(), 100);
}

function submitPemasokModal(keepOpen) {
  const nama = document.getElementById('pmsNama').value.trim();
  if (!nama) {
    alert('Nama Perusahaan / Pemasok wajib diisi!');
    document.getElementById('pmsNama').focus();
    return;
  }

  const faks = document.getElementById('pmsFaks').value.trim();
  const kontak = document.getElementById('pmsKontak').value.trim();
  const catatan = document.getElementById('pmsCatatan').value.trim();
  const alamatGabung = [
    document.getElementById('pmsAlamat1').value.trim(),
    document.getElementById('pmsAlamat2').value.trim(),
    document.getElementById('pmsKota').value.trim(),
    document.getElementById('pmsPropinsi').value.trim(),
    kontak ? `PIC: ${kontak}` : '',
    faks ? `Faks: ${faks}` : '',
    catatan ? `Ket: ${catatan}` : ''
  ].filter(Boolean).join(', ');

  const payload = {
    supplierId: document.getElementById('pmsId').value.trim(),
    namaSupplier: nama,
    kontakHp: document.getElementById('pmsTelepon').value.trim(),
    alamat: alamatGabung,
    terminHari: 14
  };

  callAdminApi('supplier/save', payload, res => {
    alert(res.message || 'Data pemasok berhasil disimpan.');
    if (typeof loadSuppliersTable === 'function') loadSuppliersTable();
    if (keepOpen) {
      openPemasokModal();
    } else {
      closeModal('pemasokModal');
    }
  }, 'Menyimpan Data Pemasok...');
}

function openPenerimaanBarangModal() {
  document.getElementById('pbNomor').value = 'PB-' + getTodayIsoDate().replace(/-/g, '') + '-' + String(Math.floor(100 + Math.random() * 899));
  document.getElementById('pbTanggal').value = getTodayIsoDate();
  document.getElementById('pbKeterangan').value = '';
  document.getElementById('pbSearchInput').value = '';
  pbItemsList = [];
  renderPenerimaanBarangTable();

  if (MASTER_PRODUCTS_CACHE.length === 0) {
    loadMasterCatalog();
  }

  const dstSup = document.getElementById('pbPemasok');
  const srcSup = document.getElementById('purSupplierId');
  if (srcSup && srcSup.options.length > 0 && dstSup) {
    dstSup.innerHTML = srcSup.innerHTML;
  } else {
    callAdminApi('supplier/list', {}, suppliers => {
      if (dstSup) {
        dstSup.innerHTML = (suppliers && suppliers.length > 0)
          ? suppliers.map(s => `<option value="${s.supplier_id} - ${s.nama_supplier}">${s.supplier_id} - ${s.nama_supplier}</option>`).join('')
          : '<option value="UMUM">-- Pemasok Umum --</option>';
      }
    }, 'Memuat Daftar Pemasok...', true);
  }

  const modal = document.getElementById('penerimaanBarangModal');
  if (modal) modal.classList.add('open');
  setTimeout(() => document.getElementById('pbSearchInput').focus(), 100);
}

function addPenerimaanBarangItem() {
  const input = document.getElementById('pbSearchInput');
  const rawVal = (input.value || '').trim();
  if (!rawVal) return;

  const found = findCatalogProduct(rawVal);
  const sku = found ? found.sku : rawVal.toUpperCase();
  const nama = found ? found.nama : rawVal;
  const satuan = found ? (found.satuan || 'PCS') : 'PCS';

  const existing = pbItemsList.find(x => x.sku === sku);
  if (existing) {
    existing.qty += 1;
  } else {
    pbItemsList.push({ sku: sku, nama: nama, qty: 1, satuan: satuan, expired: '' });
  }

  input.value = '';
  renderPenerimaanBarangTable();
}

function renderPenerimaanBarangTable() {
  const tbody = document.getElementById('pbTableBody');
  if (!tbody) return;

  if (pbItemsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">Belum ada barang ditambahkan.</td></tr>';
    return;
  }

  tbody.innerHTML = pbItemsList.map((item, idx) => `
    <tr>
      <td><strong>${item.sku}</strong></td>
      <td>${item.nama}</td>
      <td><input type="number" min="1" value="${item.qty}" onchange="pbItemsList[${idx}].qty = Number(this.value) || 1" style="text-align:right; padding:6px;"></td>
      <td>${item.satuan}</td>
      <td><input type="date" value="${item.expired}" onchange="pbItemsList[${idx}].expired = this.value" style="padding:6px;"></td>
      <td><button type="button" class="btn btn-red btn-sm" onclick="pbItemsList.splice(${idx}, 1); renderPenerimaanBarangTable();">&#10006;</button></td>
    </tr>
  `).join('');
}

function clearPenerimaanBarangRows() {
  pbItemsList = [];
  renderPenerimaanBarangTable();
}

function submitPenerimaanBarang(keepOpen) {
  if (pbItemsList.length === 0) {
    alert('Daftar barang yang diterima masih kosong!');
    return;
  }

  const nomor = document.getElementById('pbNomor').value.trim();
  const tanggal = document.getElementById('pbTanggal').value;
  const pemasok = document.getElementById('pbPemasok').value || 'UMUM';
  const ket = document.getElementById('pbKeterangan').value.trim();

  const payload = {
    tipe: 'LPB',
    asalTujuan: `${pemasok} [${nomor} | ${tanggal}]${ket ? ' - ' + ket : ''}`,
    supervisorPin: '',
    items: pbItemsList.map(it => ({
      sku: it.sku,
      qty: Number(it.qty) || 1,
      expiredDate: it.expired || ''
    }))
  };

  callAdminApi('inventory/lpb-nrb', payload, res => {
    alert(res.message || 'Penerimaan barang berhasil disimpan dan stok telah diperbarui.');
    loadMasterCatalog();
    if (keepOpen) {
      openPenerimaanBarangModal();
    } else {
      closeModal('penerimaanBarangModal');
    }
  }, 'Menyimpan Penerimaan Barang...');
}

function printPenerimaanBarang() {
  window.print();
}

// =========================================================
// READ & MONITORING STOK GUDANG + RIWAYAT MUTASI (INSTANT CACHE)
// =========================================================
function renderGudangLogs(dashData) {
  const tbody = document.getElementById('gudangHistoryTableBody');
  if (!tbody || !dashData) return;
  const logs = (dashData.recentLogs || []).filter(l => {
    const act = String(l.aktivitas || '').toUpperCase();
    return act.includes('LPB') || act.includes('NRB') || act.includes('MUTASI') || act.includes('REPACK') || act.includes('PENERIMAAN') || act.includes('PURCHASE');
  });

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">Belum ada riwayat penerimaan / mutasi terbaru.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td style="white-space:nowrap;">${l.waktu}</td>
      <td><span class="badge badge-ok">${l.aktivitas}</span></td>
      <td>${l.keterangan}</td>
      <td>${l.user}</td>
    </tr>
  `).join('');
}

function loadGudangOverview() {
  const cachedProd = getAdminCache('PRODUCTS');
  if (cachedProd) {
    MASTER_PRODUCTS_CACHE = cachedProd;
    populateCatalogDataList();
    filterGudangStockTable();
  }

  const cachedSup = getAdminCache('SUPPLIERS');
  if (cachedSup) {
    GUDANG_SUPPLIERS_CACHE = cachedSup;
    filterGudangPemasokTable();
  }

  const cachedDash = getAdminCache('DASHBOARD');
  if (cachedDash) {
    renderGudangLogs(cachedDash);
  }

  callAdminApi('admin/products', {}, items => {
    MASTER_PRODUCTS_CACHE = items || [];
    setAdminCache('PRODUCTS', MASTER_PRODUCTS_CACHE);
    populateCatalogDataList();
    filterGudangStockTable();
  }, '', true);

  callAdminApi('supplier/list', {}, suppliers => {
    GUDANG_SUPPLIERS_CACHE = suppliers || [];
    setAdminCache('SUPPLIERS', GUDANG_SUPPLIERS_CACHE);
    filterGudangPemasokTable();
  }, '', true);

  callAdminApi('finance/dashboard', {}, data => {
    setAdminCache('DASHBOARD', data);
    renderGudangLogs(data);
  }, '', true);
}

function filterGudangPemasokTable() {
  const tbody = document.getElementById('gudangPemasokTableBody');
  if (!tbody) return;

  const q = (document.getElementById('gudangSupSearch')?.value || '').toLowerCase().trim();
  const filtered = GUDANG_SUPPLIERS_CACHE.filter(s =>
    !q ||
    String(s.supplier_id || '').toLowerCase().includes(q) ||
    String(s.nama_supplier || '').toLowerCase().includes(q) ||
    String(s.kontak_hp || '').toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">Belum ada data pemasok.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><strong>${s.supplier_id}</strong></td>
      <td>${s.nama_supplier}<br><small style="color:var(--text-muted);">${s.alamat || '-'}</small></td>
      <td>${s.kontak_hp || '-'}</td>
      <td>
        <button type="button" class="btn btn-blue btn-sm" onclick='editPemasokFromGudang(${JSON.stringify(s)})'>Edit</button>
      </td>
    </tr>
  `).join('');
}

function editPemasokFromGudang(s) {
  openPemasokModal();
  document.getElementById('pmsId').value = s.supplier_id || '';
  document.getElementById('pmsNama').value = s.nama_supplier || '';
  document.getElementById('pmsTelepon').value = s.kontak_hp || '';
  document.getElementById('pmsAlamat1').value = s.alamat || '';
}

function filterGudangStockTable() {
  const tbody = document.getElementById('gudangStockTableBody');
  if (!tbody) return;

  const q = (document.getElementById('gudangSearchInput')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('gudangStockFilter')?.value || 'ALL';

  const filtered = MASTER_PRODUCTS_CACHE.filter(p => {
    const stok = p.stokTerkini != null ? Number(p.stokTerkini) : (Number(p.saldoAwal) || 0);
    const minStok = p.minStock != null ? Number(p.minStock) : 10;

    const matchText = !q ||
      String(p.sku || '').toLowerCase().includes(q) ||
      String(p.barcode || '').toLowerCase().includes(q) ||
      String(p.nama || '').toLowerCase().includes(q);

    if (!matchText) return false;
    if (statusFilter === 'EMPTY') return stok <= 0;
    if (statusFilter === 'LOW') return stok > 0 && stok < minStok;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">Data barang tidak ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const stok = p.stokTerkini != null ? Number(p.stokTerkini) : (Number(p.saldoAwal) || 0);
    const minStok = p.minStock != null ? Number(p.minStock) : 10;
    let statusBadge = '<span class="badge badge-ok">Aman</span>';
    if (stok <= 0) statusBadge = '<span class="badge badge-danger">Habis</span>';
    else if (stok < minStok) statusBadge = '<span class="badge badge-warn">Menipis</span>';

    return `
      <tr>
        <td><strong>${p.sku}</strong></td>
        <td><code>${p.barcode || '-'}</code></td>
        <td>${p.nama}</td>
        <td>${p.kategori || 'Umum'}</td>
        <td>${p.satuan || 'PCS'}</td>
        <td>${p.lokasiRak || '-'}</td>
        <td style="text-align:right; font-weight:800; font-size:14px;">${stok.toLocaleString('id-ID')}</td>
        <td>${statusBadge}</td>
        <td>
          <button type="button" class="btn btn-violet btn-sm" onclick="openStockCardModal('${p.sku}', '${String(p.nama || '').replace(/'/g, "\\'")}')">&#128203; Kartu Stok</button>
        </td>
      </tr>
    `;
  }).join('');
}

// =========================================================
// MODUL PERUSAHAAN, PREFERENSI, EDC, PIN & BACKUP (RENE POS)
// =========================================================
const COMPANY_PREF_STORAGE_KEY = 'DANISH_POS_COMPANY_PREFS';
let COMPANY_LOGO_BASE64 = '';
let EDC_TERMINALS_LIST = [
  { id: 'EDC-1', nama: 'EDC BCA Utama', jenis: 'Debit', mdr: 0.15 },
  { id: 'EDC-2', nama: 'EDC BRI / Mandiri', jenis: 'Debit', mdr: 0.15 },
  { id: 'EDC-3', nama: 'QRIS Dinamis Toko', jenis: 'QRIS', mdr: 0.7 }
];

function switchPrefPanel(panelKey, btn) {
  document.querySelectorAll('.pref-panel').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.pref-nav-btn').forEach(b => {
    b.classList.remove('btn-blue');
    b.classList.add('btn-dark');
  });
  const target = document.getElementById('pref-panel-' + panelKey);
  if (target) target.style.display = 'block';
  if (btn) {
    btn.classList.remove('btn-dark');
    btn.classList.add('btn-blue');
  }
}

function handleCompanyLogoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > 300 * 1024) {
    alert('Ukuran file logo maksimal 300 KB agar ringan dicetak pada struk.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    COMPANY_LOGO_BASE64 = e.target.result;
    renderCompanyLogoPreview(COMPANY_LOGO_BASE64);
  };
  reader.readAsDataURL(file);
}

function clearCompanyLogo() {
  COMPANY_LOGO_BASE64 = '';
  renderCompanyLogoPreview('');
}

function renderCompanyLogoPreview(dataUrl) {
  const img = document.getElementById('cfgLogoPreviewImg');
  const ph = document.getElementById('cfgLogoPlaceholder');
  if (!img || !ph) return;
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = 'block';
    ph.style.display = 'none';
  } else {
    img.src = '';
    img.style.display = 'none';
    ph.style.display = 'inline';
  }
}

function runRoundingSimulation() {
  const enabledEl = document.getElementById('cfgRoundEnabled');
  const stepEl = document.getElementById('cfgRoundStep');
  const simInEl = document.getElementById('cfgRoundSimInput');
  if (!stepEl) return;

  const enabled = enabledEl ? (enabledEl.type === 'checkbox' ? enabledEl.checked : enabledEl.value === 'true') : false;
  const dirUp = document.getElementById('cfgRoundUp') ? document.getElementById('cfgRoundUp').checked : false;
  const step = Number(stepEl.value || 100);
  const sample = Number(simInEl ? simInEl.value : 65366) || 0;

  let rounded = sample;
  if (enabled && step > 0) {
    rounded = dirUp ? Math.ceil(sample / step) * step : Math.floor(sample / step) * step;
  }
  const outEl = document.getElementById('cfgRoundSimOutput');
  if (outEl) outEl.textContent = rounded.toLocaleString('id-ID');

  const receiptBase = 32044;
  const receiptRounded = (enabled && step > 0)
    ? (dirUp ? Math.ceil(receiptBase / step) * step : Math.floor(receiptBase / step) * step)
    : receiptBase;
  const diff = receiptRounded - receiptBase;
  if (document.getElementById('cfgRoundReceiptDiff')) {
    document.getElementById('cfgRoundReceiptDiff').textContent = (diff > 0 ? '+' : '') + diff;
    document.getElementById('cfgRoundReceiptTotal').textContent = receiptRounded.toLocaleString('id-ID');
    document.getElementById('cfgRoundReceiptChange').textContent = (35000 - receiptRounded).toLocaleString('id-ID');
  }
}

function runScaleBarcodeSimulation() {
  const sampleEl = document.getElementById('cfgScaleSampleBarcode');
  if (!sampleEl) return;

  const raw = String(sampleEl.value || '').trim();
  const isPrice = document.getElementById('cfgScaleModePrice') ? document.getElementById('cfgScaleModePrice').checked : false;
  const valLen = Math.max(1, Number(document.getElementById('cfgScaleValueLen')?.value || 6));
  const ignoreLast = document.getElementById('cfgScaleIgnoreCheckDigit')?.checked || false;
  const decPos = Math.max(0, Number(document.getElementById('cfgScaleDecimalPos')?.value || 2));

  const effectiveBarcode = ignoreLast && raw.length > 1 ? raw.slice(0, -1) : raw;
  const pluPart = effectiveBarcode.length > valLen ? effectiveBarcode.slice(0, effectiveBarcode.length - valLen) : '';
  const valPart = effectiveBarcode.slice(-valLen);

  let parsedDisplay = valPart;
  if (!isPrice && decPos > 0 && decPos < valPart.length) {
    const intPart = String(Number(valPart.slice(0, decPos)));
    const fracPart = valPart.slice(decPos);
    parsedDisplay = `${intPart},${fracPart} Kg`;
  } else if (isPrice) {
    parsedDisplay = `Rp ${Number(valPart || 0).toLocaleString('id-ID')}`;
  }

  if (document.getElementById('cfgScaleOutPlu')) {
    document.getElementById('cfgScaleOutPlu').value = pluPart;
    document.getElementById('cfgScaleOutRaw').value = valPart;
    document.getElementById('cfgScaleOutParsed').value = parsedDisplay;
  }
}

function setFieldVal(id, val) {
  const el = document.getElementById(id);
  if (!el || val === undefined || val === null) return;
  if (el.type === 'checkbox') el.checked = Boolean(val);
  else el.value = val;
}

function getFieldVal(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}

function applyPreferencesToForm(saved) {
  if (!document.getElementById('cfgCompanyName')) return;

  setFieldVal('cfgCompanyName', saved.companyName || (SESSION ? SESSION.store.namaToko : ''));
  setFieldVal('cfgCompanyType', saved.companyType || 'Retail, Minimarket');
  setFieldVal('cfgCompanyNpwp', saved.companyNpwp || '');
  setFieldVal('cfgCompanyPhone', saved.companyPhone || '');
  setFieldVal('cfgCompanyFax', saved.companyFax || '');
  setFieldVal('cfgCompanyEmail', saved.companyEmail || '');
  setFieldVal('cfgCompanyAddress', saved.companyAddress || '');
  setFieldVal('cfgReceiptFooter', saved.receiptFooter || 'Terima kasih telah berbelanja!');
  setFieldVal('cfgStartDataDate', saved.startDataDate || getTodayIsoDate());

  COMPANY_LOGO_BASE64 = saved.logoBase64 || '';
  renderCompanyLogoPreview(COMPANY_LOGO_BASE64);

  // Pajak
  const taxEl = document.getElementById('cfgTaxEnabled');
  if (taxEl) {
    if (taxEl.type === 'checkbox') taxEl.checked = Boolean(saved.taxEnabled);
    else taxEl.value = String(Boolean(saved.taxEnabled));
  }
  setFieldVal('cfgTaxMainName', saved.taxMainName || 'PPN');
  setFieldVal('cfgTaxMainCode', saved.taxMainCode || 'P');
  setFieldVal('cfgTaxPct', saved.taxPct != null ? saved.taxPct : 11);
  setFieldVal('cfgTaxExtraEnabled', Boolean(saved.taxExtraEnabled));
  setFieldVal('cfgTaxExtraName', saved.taxExtraName || 'PB1');
  setFieldVal('cfgTaxExtraCode', saved.taxExtraCode || 'B');
  setFieldVal('cfgTaxExtraPct', saved.taxExtraPct != null ? saved.taxExtraPct : 10);
  setFieldVal('cfgTaxInclusive', saved.taxInclusive !== undefined ? saved.taxInclusive : true);
  setFieldVal('cfgTaxBeforeDiscount', Boolean(saved.taxBeforeDiscount));
  setFieldVal('cfgTaxOnlineEnabled', Boolean(saved.taxOnlineEnabled));
  setFieldVal('cfgTaxNopd', saved.taxNopd || '');
  setFieldVal('cfgTaxOnlineFolder', saved.taxOnlineFolder || '');
  setFieldVal('cfgTaxOnlinePrefix', saved.taxOnlinePrefix || 'R');

  // Pembulatan Struk
  setFieldVal('cfgRoundEnabled', Boolean(saved.roundEnabled));
  if (saved.roundMode === 'UP' && document.getElementById('cfgRoundUp')) {
    document.getElementById('cfgRoundUp').checked = true;
  } else if (document.getElementById('cfgRoundDown')) {
    document.getElementById('cfgRoundDown').checked = true;
  }
  setFieldVal('cfgRoundStep', saved.roundStep || '100');

  // Biaya Tambahan & Pembungkus
  setFieldVal('cfgExtraFeeLabel', saved.extraFeeLabel || 'Biaya Layanan');
  setFieldVal('cfgExtraFeeType', saved.extraFeeType || 'NONE');
  setFieldVal('cfgExtraFeeVal', saved.extraFeeVal || 0);
  setFieldVal('cfgBagEnabled', String(saved.bagEnabled || false));
  setFieldVal('cfgBagName', saved.bagName || 'Kantong Belanja Ramah Lingkungan');
  setFieldVal('cfgBagPrice', saved.bagPrice || 500);

  // Timbangan
  const scaleEl = document.getElementById('cfgScaleEnabled');
  if (scaleEl) {
    if (scaleEl.type === 'checkbox') scaleEl.checked = Boolean(saved.scaleEnabled);
    else scaleEl.value = String(Boolean(saved.scaleEnabled));
  }
  if (saved.scaleMode === 'PRICE' && document.getElementById('cfgScaleModePrice')) {
    document.getElementById('cfgScaleModePrice').checked = true;
  } else if (document.getElementById('cfgScaleModeWeight')) {
    document.getElementById('cfgScaleModeWeight').checked = true;
  }
  setFieldVal('cfgScaleSampleBarcode', saved.scaleSampleBarcode || '8686009007656');
  setFieldVal('cfgScaleValueLen', saved.scaleValueLen || 6);
  setFieldVal('cfgScaleIgnoreCheckDigit', Boolean(saved.scaleIgnoreCheckDigit));
  setFieldVal('cfgScaleDecimalPos', saved.scaleDecimalPos != null ? saved.scaleDecimalPos : 2);

  // Layar Tambahan, Poin & Penomoran
  setFieldVal('cfgDualDisplayEnabled', Boolean(saved.dualDisplayEnabled));
  setFieldVal('cfgDualDisplayPromoText', saved.dualDisplayPromoText || 'Selamat Datang! Dapatkan Poin Reward setiap belanja.');
  setFieldVal('cfgDualDisplayBannerUrl', saved.dualDisplayBannerUrl || '');
  setFieldVal('cfgPointEarnStep', saved.pointEarnStep || 10000);
  setFieldVal('cfgPointRedeemVal', saved.pointRedeemVal || 100);
  setFieldVal('cfgPointMinRedeem', saved.pointMinRedeem || 50);
  setFieldVal('cfgPrefixStruk', saved.prefixStruk || 'TRX-');
  setFieldVal('cfgPrefixLpb', saved.prefixLpb || 'PB-');

  // Shift Kasir
  const shifts = Array.isArray(saved.shifts) ? saved.shifts : [];
  if (shifts[0]) {
    setFieldVal('cfgShift1Name', shifts[0].nama || 'Shift-1');
    setFieldVal('cfgShift1Start', shifts[0].mulai || '09:00');
    setFieldVal('cfgShift1End', shifts[0].selesai || '15:30');
  }
  if (shifts[1]) {
    setFieldVal('cfgShift2Name', shifts[1].nama || 'Shift-2');
    setFieldVal('cfgShift2Start', shifts[1].mulai || '15:30');
    setFieldVal('cfgShift2End', shifts[1].selesai || '22:00');
  }
  if (shifts[2]) {
    setFieldVal('cfgShift3Name', shifts[2].nama || '');
    setFieldVal('cfgShift3Start', shifts[2].mulai || '23:00');
    setFieldVal('cfgShift3End', shifts[2].selesai || '07:00');
  }
  setFieldVal('cfgShiftRequireModal', String(saved.shiftRequireModal !== undefined ? saved.shiftRequireModal : true));
  setFieldVal('cfgShiftBlindClose', String(saved.shiftBlindClose !== undefined ? saved.shiftBlindClose : true));

  if (saved.edcTerminals && Array.isArray(saved.edcTerminals)) {
    EDC_TERMINALS_LIST = saved.edcTerminals;
  }

  runRoundingSimulation();
  runScaleBarcodeSimulation();
}

function loadCompanyPreferences() {
  const localPrefs = JSON.parse(localStorage.getItem(COMPANY_PREF_STORAGE_KEY) || '{}');
  applyPreferencesToForm(localPrefs);

  callAdminApi('admin/get-preferences', {}, cloudPrefs => {
    if (cloudPrefs && Object.keys(cloudPrefs).length > 0) {
      localStorage.setItem(COMPANY_PREF_STORAGE_KEY, JSON.stringify(cloudPrefs));
      applyPreferencesToForm(cloudPrefs);
    }
  }, '', true);
}

function saveCompanyPreferences() {
  const taxEl = document.getElementById('cfgTaxEnabled');
  const scaleEl = document.getElementById('cfgScaleEnabled');
  const roundEl = document.getElementById('cfgRoundEnabled');

  const prefs = {
    companyName: String(getFieldVal('cfgCompanyName', '')).trim(),
    companyType: getFieldVal('cfgCompanyType', 'Retail, Minimarket'),
    companyNpwp: String(getFieldVal('cfgCompanyNpwp', '')).trim(),
    companyPhone: String(getFieldVal('cfgCompanyPhone', '')).trim(),
    companyFax: String(getFieldVal('cfgCompanyFax', '')).trim(),
    companyEmail: String(getFieldVal('cfgCompanyEmail', '')).trim(),
    companyAddress: String(getFieldVal('cfgCompanyAddress', '')).trim(),
    receiptFooter: String(getFieldVal('cfgReceiptFooter', '')).trim(),
    startDataDate: getFieldVal('cfgStartDataDate', ''),
    logoBase64: COMPANY_LOGO_BASE64,

    taxEnabled: taxEl ? (taxEl.type === 'checkbox' ? taxEl.checked : taxEl.value === 'true') : false,
    taxMainName: String(getFieldVal('cfgTaxMainName', 'PPN')).trim(),
    taxMainCode: String(getFieldVal('cfgTaxMainCode', 'P')).trim(),
    taxPct: Number(getFieldVal('cfgTaxPct', 0)) || 0,
    taxExtraEnabled: Boolean(getFieldVal('cfgTaxExtraEnabled', false)),
    taxExtraName: String(getFieldVal('cfgTaxExtraName', 'PB1')).trim(),
    taxExtraCode: String(getFieldVal('cfgTaxExtraCode', 'B')).trim(),
    taxExtraPct: Number(getFieldVal('cfgTaxExtraPct', 0)) || 0,
    taxInclusive: Boolean(getFieldVal('cfgTaxInclusive', true)),
    taxBeforeDiscount: Boolean(getFieldVal('cfgTaxBeforeDiscount', false)),
    taxOnlineEnabled: Boolean(getFieldVal('cfgTaxOnlineEnabled', false)),
    taxNopd: String(getFieldVal('cfgTaxNopd', '')).trim(),
    taxOnlineFolder: String(getFieldVal('cfgTaxOnlineFolder', '')).trim(),
    taxOnlinePrefix: String(getFieldVal('cfgTaxOnlinePrefix', 'R')).trim(),

    roundEnabled: roundEl ? (roundEl.type === 'checkbox' ? roundEl.checked : roundEl.value === 'true') : false,
    roundMode: document.getElementById('cfgRoundUp')?.checked ? 'UP' : 'DOWN',
    roundStep: getFieldVal('cfgRoundStep', '100'),

    extraFeeLabel: String(getFieldVal('cfgExtraFeeLabel', 'Biaya Layanan')).trim(),
    extraFeeType: getFieldVal('cfgExtraFeeType', 'NONE'),
    extraFeeVal: Number(getFieldVal('cfgExtraFeeVal', 0)) || 0,
    bagEnabled: getFieldVal('cfgBagEnabled', 'false') === 'true',
    bagName: String(getFieldVal('cfgBagName', 'Kantong Belanja')).trim(),
    bagPrice: Number(getFieldVal('cfgBagPrice', 0)) || 0,

    scaleEnabled: scaleEl ? (scaleEl.type === 'checkbox' ? scaleEl.checked : scaleEl.value === 'true') : false,
    scaleMode: document.getElementById('cfgScaleModePrice')?.checked ? 'PRICE' : 'WEIGHT',
    scaleSampleBarcode: String(getFieldVal('cfgScaleSampleBarcode', '8686009007656')).trim(),
    scaleValueLen: Number(getFieldVal('cfgScaleValueLen', 6)) || 6,
    scaleIgnoreCheckDigit: Boolean(getFieldVal('cfgScaleIgnoreCheckDigit', false)),
    scaleDecimalPos: Number(getFieldVal('cfgScaleDecimalPos', 2)) || 2,

    dualDisplayEnabled: Boolean(getFieldVal('cfgDualDisplayEnabled', false)),
    dualDisplayPromoText: String(getFieldVal('cfgDualDisplayPromoText', '')).trim(),
    dualDisplayBannerUrl: String(getFieldVal('cfgDualDisplayBannerUrl', '')).trim(),
    pointEarnStep: Number(getFieldVal('cfgPointEarnStep', 10000)) || 10000,
    pointRedeemVal: Number(getFieldVal('cfgPointRedeemVal', 100)) || 100,
    pointMinRedeem: Number(getFieldVal('cfgPointMinRedeem', 50)) || 50,
    prefixStruk: String(getFieldVal('cfgPrefixStruk', 'TRX-')).trim() || 'TRX-',
    prefixLpb: String(getFieldVal('cfgPrefixLpb', 'PB-')).trim() || 'PB-',

    shifts: [
      { nama: String(getFieldVal('cfgShift1Name', 'Shift-1')).trim(), mulai: getFieldVal('cfgShift1Start', '09:00'), selesai: getFieldVal('cfgShift1End', '15:30') },
      { nama: String(getFieldVal('cfgShift2Name', 'Shift-2')).trim(), mulai: getFieldVal('cfgShift2Start', '15:30'), selesai: getFieldVal('cfgShift2End', '22:00') },
      { nama: String(getFieldVal('cfgShift3Name', '')).trim(), mulai: getFieldVal('cfgShift3Start', '23:00'), selesai: getFieldVal('cfgShift3End', '07:00') }
    ],
    shiftRequireModal: getFieldVal('cfgShiftRequireModal', 'true') === 'true',
    shiftBlindClose: getFieldVal('cfgShiftBlindClose', 'true') === 'true',
    edcTerminals: EDC_TERMINALS_LIST
  };

  localStorage.setItem(COMPANY_PREF_STORAGE_KEY, JSON.stringify(prefs));
  callAdminApi('admin/save-preferences', prefs, res => {
    alert(res.message || 'Preferensi Perusahaan & Pengaturan Kasir berhasil disimpan!');
  }, 'Menyimpan Preferensi ke Cloud...');
}

function openChangePinModal() {
  document.getElementById('pinOldInput').value = '';
  document.getElementById('pinNewInput').value = '';
  document.getElementById('pinConfirmInput').value = '';
  document.getElementById('changePinModal').classList.add('open');
}

function submitChangePin() {
  const oldPin = document.getElementById('pinOldInput').value.trim();
  const newPin = document.getElementById('pinNewInput').value.trim();
  const confirmPin = document.getElementById('pinConfirmInput').value.trim();
  if (!newPin || newPin.length < 4) return alert('PIN baru minimal 4 digit.');
  if (newPin !== confirmPin) return alert('Konfirmasi PIN baru tidak cocok!');

  callAdminApi('security/change-pin', {
    userId: SESSION ? SESSION.user.idUser : '',
    oldPin,
    newPin
  }, res => {
    closeModal('changePinModal');
    alert(res.message || 'PIN otorisasi berhasil diperbarui.');
  }, 'Memperbarui PIN Otorisasi...');
}

function openEdcCardModal() {
  renderEdcTable();
  document.getElementById('edcCardModal').classList.add('open');
}

function renderEdcTable() {
  const tbody = document.getElementById('edcTableBody');
  if (!tbody) return;
  tbody.innerHTML = EDC_TERMINALS_LIST.map((e, idx) => `
    <tr>
      <td><strong>${e.nama}</strong></td>
      <td><span class="badge badge-ok">${e.jenis}</span></td>
      <td>${e.mdr}%</td>
      <td><button type="button" class="btn btn-red btn-sm" onclick="EDC_TERMINALS_LIST.splice(${idx}, 1); renderEdcTable(); saveCompanyPreferences();">Hapus</button></td>
    </tr>
  `).join('');
}

function addEdcTerminal() {
  const nama = document.getElementById('edcNameInput').value.trim();
  const jenis = document.getElementById('edcTypeInput').value;
  const mdr = Number(document.getElementById('edcMdrInput').value) || 0;
  if (!nama) return alert('Nama Terminal EDC wajib diisi.');
  EDC_TERMINALS_LIST.push({ id: 'EDC-' + Date.now(), nama, jenis, mdr });
  document.getElementById('edcNameInput').value = '';
  renderEdcTable();
  saveCompanyPreferences();
}

function openRoleMatrixModal() {
  document.getElementById('roleMatrixModal').classList.add('open');
}

function openImportMasterModal() {
  document.getElementById('importMasterModal').classList.add('open');
}

function downloadCsvTemplate() {
  const csvContent =
    '\uFEFF' +
    'SKU;Barcode;NamaBarang;Kategori;Satuan;HPP;HargaJual;SaldoAwal\r\n' +
    'SKU-2001;8991234567890;Contoh Produk Baru;Umum;PCS;8000;10000;25';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'Template_Impor_Master_Barang.csv';
  link.click();
}

async function sendProductWithRetry(payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ApiClient.call('admin/save-product', payload);
      return true;
    } catch (err) {
      if (attempt === maxRetries) return false;
      // Tunggu 1.5 detik sebelum mencoba ulang jika jaringan sempat terputus
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  return false;
}

function processCsvImport() {
  const fileInput = document.getElementById('importCsvFile');
  if (!fileInput.files || !fileInput.files[0]) return alert('Pilih file CSV terlebih dahulu.');

  const reader = new FileReader();
  reader.onload = async function (e) {
    const lines = e.target.result.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return alert('File CSV kosong atau tidak memiliki baris data.');

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const items = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter);
      if (cols.length < 3 || !cols[0].trim()) continue;
      items.push({
        sku: cols[0].trim(),
        barcode: (cols[1] || '').trim(),
        nama: (cols[2] || '').trim(),
        kategori: (cols[3] || 'Umum').trim(),
        satuan: (cols[4] || 'PCS').trim(),
        hargaModal: Number(cols[5]) || 0,
        hargaJual: Number(cols[6]) || 0,
        saldoAwal: Number(cols[7]) || 0
      });
    }

    if (!items.length) return alert('Tidak ada baris barang yang valid untuk diimpor.');

    // Tampilkan indikator status pada tombol impor
    const importBtn = document.querySelector('#importMasterModal .btn-green');
    const origBtnText = importBtn ? importBtn.innerHTML : '';
    if (importBtn) importBtn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    // Kirim per kelompok (5 paralel) agar cepat namun tidak membebani jaringan
    const chunkSize = 5;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      if (importBtn) {
        importBtn.innerHTML = `Mengimpor ${Math.min(i + chunkSize, items.length)} / ${items.length}...`;
      }
      const results = await Promise.all(chunk.map(item => sendProductWithRetry(item, 3)));
      results.forEach(ok => (ok ? successCount++ : failCount++));
    }

    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = origBtnText;
    }

    alert(
      `Impor selesai!\n` +
      `Berhasil: ${successCount} barang\n` +
      (failCount > 0 ? `Gagal (periksa koneksi): ${failCount} barang` : '')
    );

    closeModal('importMasterModal');
    loadMasterCatalog();
  };
  reader.readAsText(fileInput.files[0]);
}
function openDatabaseBackupModal() {
  const fileInp = document.getElementById('restoreBackupFile');
  if (fileInp) fileInp.value = '';
  document.getElementById('databaseBackupModal').classList.add('open');
}

function downloadFullBackupJson() {
  callAdminApi('admin/full-backup', {}, backupData => {
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Backup_DanishPOS_${backupData.storeCode || 'STORE'}_${getTodayIsoDate()}.json`;
    link.click();
  }, 'Mengunduh Full Backup dari Cloud...');
}

function restoreFullBackupJson() {
  const fileInput = document.getElementById('restoreBackupFile');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    return alert('Pilih file backup (.JSON) terlebih dahulu!');
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || (!data.preferences && !data.products && !data.members && !data.suppliers && !data.categories)) {
        return alert('Format file JSON tidak dikenali sebagai file backup Danish POS!');
      }

      const jmlProduk = Array.isArray(data.products) ? data.products.length : 0;
      const jmlKat = Array.isArray(data.categories) ? data.categories.length : 0;
      const jmlMember = Array.isArray(data.members) ? data.members.length : 0;
      const jmlSup = Array.isArray(data.suppliers) ? data.suppliers.length : 0;

      const konfirmasi = confirm(
        `KONFIRMASI RESTORE DATABASE CLOUD\n` +
        `Waktu Backup: ${data.exportedAt || '-'}\n\n` +
        `Data yang akan dipulihkan ke Google Sheets:\n` +
        `• Katalog Barang: ${jmlProduk} item\n` +
        `• Kategori Barang: ${jmlKat} data\n` +
        `• Pelanggan / Member: ${jmlMember} data\n` +
        `• Pemasok / Supplier: ${jmlSup} data\n` +
        `• Preferensi & Pengaturan Toko\n\n` +
        `Lanjutkan proses restore sekarang?`
      );
      if (!konfirmasi) return;

      callAdminApi('admin/full-restore', data, res => {
        if (data.preferences && Object.keys(data.preferences).length > 0) {
          localStorage.setItem(COMPANY_PREF_STORAGE_KEY, JSON.stringify(data.preferences));
          applyPreferencesToForm(data.preferences);
        }
        if (Array.isArray(data.products)) {
          MASTER_PRODUCTS_CACHE = data.products;
          setAdminCache('PRODUCTS', data.products);
        }
        if (Array.isArray(data.categories)) {
          cachedCategories = data.categories;
          setAdminCache('CATEGORIES', data.categories);
        }
        if (Array.isArray(data.members)) {
          MEMBERS_CACHE = data.members;
          setAdminCache('MEMBERS', data.members);
        }
        if (Array.isArray(data.suppliers)) {
          GUDANG_SUPPLIERS_CACHE = data.suppliers;
          setAdminCache('SUPPLIERS', data.suppliers);
        }

        fileInput.value = '';
        closeModal('databaseBackupModal');
        alert(res.message || 'Restore database berhasil!');
        loadDashboard();
      }, 'Memulihkan Database ke Google Sheets...');
    } catch (err) {
      alert('File JSON rusak atau tidak valid: ' + err.message);
    }
  };

  reader.readAsText(fileInput.files[0]);
}

function openCustomerDisplayWindow() {
  const promoText = document.getElementById('cfgDualDisplayPromoText').value || 'Selamat Berbelanja!';
  const bannerUrl = document.getElementById('cfgDualDisplayBannerUrl').value || '';
  const win = window.open('', 'CustomerDisplayWin', 'width=900,height=600');
  if (!win) return alert('Izinkan pop-up browser untuk membuka Layar Tambahan.');
  win.document.write(`
    <html><head><title>Customer Display - ${SESSION ? SESSION.store.namaToko : 'Danish POS'}</title></head>
    <body style="margin:0; font-family:sans-serif; background:#0B192C; color:#fff; display:flex; height:100vh;">
      <div style="flex:1.2; padding:24px; border-right:1px solid #1E293B; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <h2 style="margin:0; color:#34D399;">${SESSION ? SESSION.store.namaToko : 'DANISH POS'}</h2>
          <p style="color:#94A3B8; font-size:13px;">Rincian Belanja Anda</p>
          <div style="margin-top:40px; text-align:center; color:#64748B;">Menunggu kasir memindai barang...</div>
        </div>
        <div style="background:#1E293B; padding:16px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:16px;">TOTAL BELANJA</span>
          <strong style="font-size:32px; color:#FBBF24;">Rp 0</strong>
        </div>
      </div>
      <div style="flex:1; padding:24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background:#132744;">
        ${bannerUrl ? `<img src="${bannerUrl}" style="max-width:100%; max-height:320px; border-radius:12px; margin-bottom:16px;">` : '<div style="font-size:64px; margin-bottom:16px;">&#128722;</div>'}
        <h3 style="color:#FBBF24; margin:0 0 8px 0;">PROMO &amp; INFORMASI TOKO</h3>
        <p style="font-size:16px; line-height:1.5;">${promoText}</p>
      </div>
    </body></html>
  `);
}

// =========================================================
// INISIALISASI AWAL & PRE-FETCH CACHE LATAR BELAKANG
// =========================================================
loadDashboard();

setTimeout(() => {
  if (!getAdminCache('PRODUCTS')) {
    callAdminApi('admin/products', {}, items => {
      MASTER_PRODUCTS_CACHE = items || [];
      setAdminCache('PRODUCTS', MASTER_PRODUCTS_CACHE);
      populateCatalogDataList();
    }, '', true);
  }
  if (!getAdminCache('CATEGORIES')) {
    callAdminApi('admin/categories', {}, data => {
      cachedCategories = (data && data.categories) ? data.categories : [];
      setAdminCache('CATEGORIES', cachedCategories);
      populateCategoryDropdown();
    }, '', true);
  }
  if (!getAdminCache('SUPPLIERS')) {
    callAdminApi('supplier/list', {}, suppliers => {
      GUDANG_SUPPLIERS_CACHE = suppliers || [];
      setAdminCache('SUPPLIERS', GUDANG_SUPPLIERS_CACHE);
    }, '', true);
  }
}, 1500);

document.addEventListener('DOMContentLoaded', function() {
  if (typeof initReportModule === 'function') {
    initReportModule();
  }
  document.querySelectorAll('[onclick*="reports"]').forEach(function(el) {
    el.addEventListener('click', function() {
      if (typeof initReportModule === 'function') {
        setTimeout(initReportModule, 50);
      }
    });
  });
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(function() {
    if (typeof initReportModule === 'function') initReportModule();
  }, 50);
}

/* ============================================================================
   MODUL DESAIN: LAYAR KASIR, CETAK STRUK/DOKUMEN, & CETAK LABEL HARGA/RAK
   ============================================================================ */
const KASIR_PRESETS = ['Minimarket 1', 'Supermarket / Touch', 'Cafe & Resto'];
let currentKasirPresetIdx = 0;
let activeStrukDocType = 'pembayaran';

function switchDesignSubModule(modName, btnEl) {
  document.querySelectorAll('.design-submod').forEach(el => el.style.display = 'none');
  const target = document.getElementById('design-mod-' + modName);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.design-top-btn').forEach(b => {
    b.classList.remove('btn-blue');
    b.classList.add('btn-dark');
  });
  if (btnEl) {
    btnEl.classList.remove('btn-dark');
    btnEl.classList.add('btn-blue');
  }

  if (modName === 'kasir') renderKasirDesignPreview();
  if (modName === 'struk') renderStrukDocPreview();
  if (modName === 'label') initDesignLabelCatalog();
}

function cycleKasirPreset(step) {
  currentKasirPresetIdx = (currentKasirPresetIdx + step + KASIR_PRESETS.length) % KASIR_PRESETS.length;
  const lbl = document.getElementById('dsgKasirPresetLabel');
  if (lbl) lbl.textContent = KASIR_PRESETS[currentKasirPresetIdx];

  const isResto = currentKasirPresetIdx === 2;
  const isTouch = currentKasirPresetIdx === 1;
  if (document.getElementById('dsgCompTableNo')) document.getElementById('dsgCompTableNo').checked = isResto;
  if (document.getElementById('dsgCompSplit')) document.getElementById('dsgCompSplit').checked = isResto;
  if (document.getElementById('dsgCompCatMenu')) document.getElementById('dsgCompCatMenu').checked = isResto || isTouch;
  renderKasirDesignPreview();
}

function toggleKasirAdvancedDesign() {
  const box = document.getElementById('dsgKasirAdvancedBox');
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function renderKasirDesignPreview() {
  const storeName = document.getElementById('cfgCompanyName')?.value || document.getElementById('storeTitle')?.textContent || 'DANISH SHOP';
  const elStore = document.getElementById('dsgPreviewStoreName');
  if (elStore) elStore.textContent = storeName;

  const accent = document.getElementById('dsgKasirAccentColor')?.value || '#1D4ED8';
  const hdr = document.getElementById('dsgPreviewHeaderBar');
  if (hdr) hdr.style.background = accent;

  const totSize = document.getElementById('dsgKasirTotalSize')?.value || '42px';
  const pvTot = document.getElementById('pvSubTotalVal');
  if (pvTot) pvTot.style.fontSize = totSize;

  const toggleVis = (id, show, disp = 'block') => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? disp : 'none';
  };

  toggleVis('pvScanInput', document.getElementById('dsgCompScan')?.checked, 'block');
  toggleVis('pvActiveItemBar', document.getElementById('dsgCompActiveItem')?.checked, 'flex');
  toggleVis('pvCategoryBar', document.getElementById('dsgCompCatMenu')?.checked, 'flex');
  toggleVis('pvCustomerInput', document.getElementById('dsgCompCustomer')?.checked, 'block');
  toggleVis('pvTableNoInput', document.getElementById('dsgCompTableNo')?.checked, 'block');
  toggleVis('pvQuickMenuCol', document.getElementById('dsgCompQuickMenu')?.checked, 'flex');
  toggleVis('pvHoldBtns', document.getElementById('dsgCompHoldRecall')?.checked, 'flex');
  toggleVis('pvSplitBtn', document.getElementById('dsgCompSplit')?.checked, 'block');
  toggleVis('pvLogoBox', document.getElementById('dsgCompLogo')?.checked, 'flex');
}

function openKasirColumnConfigModal() {
  alert('Kolom Aktif Tabel Kasir: KTS, NAMA BARANG, @ HARGA, DISKON, TOTAL.\n(Gunakan tombol Simpan Desain untuk menerapkan ke layar kasir).');
}

function applyDesignConfigToUI(cfg) {
  if (!cfg || typeof cfg !== 'object') {
    renderKasirDesignPreview();
    return;
  }

  if (cfg.preset) {
    const idx = KASIR_PRESETS.indexOf(cfg.preset);
    if (idx >= 0) {
      currentKasirPresetIdx = idx;
      const lbl = document.getElementById('dsgKasirPresetLabel');
      if (lbl) lbl.textContent = KASIR_PRESETS[idx];
    }
  }

  if (document.getElementById('dsgCompScan')) document.getElementById('dsgCompScan').checked = cfg.compScan !== false;
  if (document.getElementById('dsgCompActiveItem')) document.getElementById('dsgCompActiveItem').checked = cfg.compActiveItem !== false;
  if (document.getElementById('dsgCompCatMenu')) document.getElementById('dsgCompCatMenu').checked = !!cfg.compCatMenu;
  if (document.getElementById('dsgCompCustomer')) document.getElementById('dsgCompCustomer').checked = cfg.compCustomer !== false;
  if (document.getElementById('dsgCompTableNo')) document.getElementById('dsgCompTableNo').checked = !!cfg.compTableNo;
  if (document.getElementById('dsgCompQuickMenu')) document.getElementById('dsgCompQuickMenu').checked = cfg.compQuickMenu !== false;
  if (document.getElementById('dsgCompHoldRecall')) document.getElementById('dsgCompHoldRecall').checked = cfg.compHoldRecall !== false;
  if (document.getElementById('dsgCompSplit')) document.getElementById('dsgCompSplit').checked = !!cfg.compSplit;
  if (document.getElementById('dsgCompLogo')) document.getElementById('dsgCompLogo').checked = cfg.compLogo !== false;

  if (cfg.accentColor && document.getElementById('dsgKasirAccentColor')) {
    document.getElementById('dsgKasirAccentColor').value = cfg.accentColor;
  }
  if (cfg.totalSize && document.getElementById('dsgKasirTotalSize')) {
    document.getElementById('dsgKasirTotalSize').value = cfg.totalSize;
  }
  if (cfg.strukPaperSize && document.getElementById('strukPaperSizeSelect')) {
    document.getElementById('strukPaperSizeSelect').value = cfg.strukPaperSize;
  }
  if (document.getElementById('strukShowTaxDetail')) {
    document.getElementById('strukShowTaxDetail').checked = !!cfg.strukShowTaxDetail;
  }
  if (document.getElementById('strukShowMemberPoint')) {
    document.getElementById('strukShowMemberPoint').checked = !!cfg.strukShowMemberPoint;
  }
  if (document.getElementById('strukPrintOrderSlip')) {
    document.getElementById('strukPrintOrderSlip').checked = !!cfg.strukPrintOrderSlip;
  }
  if (cfg.labelModel && document.getElementById('lblModelSelect')) {
    document.getElementById('lblModelSelect').value = cfg.labelModel;
  }

  renderKasirDesignPreview();
  renderStrukDocPreview();
}

function saveDesignSettings() {
  const storeCode = getActiveTokoCode();
  const payload = {
    kodeToko: storeCode,
    preset: KASIR_PRESETS[currentKasirPresetIdx],
    compScan: document.getElementById('dsgCompScan')?.checked,
    compActiveItem: document.getElementById('dsgCompActiveItem')?.checked,
    compCatMenu: document.getElementById('dsgCompCatMenu')?.checked,
    compCustomer: document.getElementById('dsgCompCustomer')?.checked,
    compTableNo: document.getElementById('dsgCompTableNo')?.checked,
    compQuickMenu: document.getElementById('dsgCompQuickMenu')?.checked,
    compHoldRecall: document.getElementById('dsgCompHoldRecall')?.checked,
    compSplit: document.getElementById('dsgCompSplit')?.checked,
    compLogo: document.getElementById('dsgCompLogo')?.checked,
    accentColor: document.getElementById('dsgKasirAccentColor')?.value || '#1D4ED8',
    totalSize: document.getElementById('dsgKasirTotalSize')?.value || '42px',
    strukPaperSize: document.getElementById('strukPaperSizeSelect')?.value || '58mm',
    strukShowTaxDetail: document.getElementById('strukShowTaxDetail')?.checked,
    strukShowMemberPoint: document.getElementById('strukShowMemberPoint')?.checked,
    strukPrintOrderSlip: document.getElementById('strukPrintOrderSlip')?.checked,
    labelModel: document.getElementById('lblModelSelect')?.value || 'PRICE_TAG_2'
  };

  // Simpan instan ke cache lokal
  localStorage.setItem('DANISH_DESIGN_CONFIG_' + storeCode, JSON.stringify(payload));

  // Simpan permanen ke Backend Google Sheets
  callAdminApi('admin/save-design', payload, res => {
    alert((res && res.message) ? res.message : 'Pengaturan Desain berhasil disimpan ke Server!');
  }, 'Menyimpan Desain ke Cloud...');
}

function loadDesignSettings() {
  const storeCode = getActiveTokoCode();

  // 1. Tampilkan instan dari cache lokal terlebih dahulu
  try {
    const raw = localStorage.getItem('DANISH_DESIGN_CONFIG_' + storeCode);
    if (raw) {
      applyDesignConfigToUI(JSON.parse(raw));
    } else {
      renderKasirDesignPreview();
    }
  } catch (e) {
    renderKasirDesignPreview();
  }

  // 2. Sinkronkan dari Backend Google Sheets di latar belakang
  callAdminApi('admin/get-design', { kodeToko: storeCode }, cloudCfg => {
    if (cloudCfg && Object.keys(cloudCfg).length > 0) {
      localStorage.setItem('DANISH_DESIGN_CONFIG_' + storeCode, JSON.stringify(cloudCfg));
      applyDesignConfigToUI(cloudCfg);
    }
  }, '', true);
}

/* --- SUB-MODUL 2: CETAK STRUK & DOKUMEN (6 TEMPLATE ALA RENE POS) --- */
function switchStrukDocType(docType, btnEl) {
  activeStrukDocType = docType;
  document.querySelectorAll('.struk-nav-btn').forEach(b => {
    b.classList.remove('btn-blue');
    b.classList.add('btn-dark');
  });
  if (btnEl) {
    btnEl.classList.remove('btn-dark');
    btnEl.classList.add('btn-blue');
  }

  const meta = {
    pembayaran: ['Struk Pembayaran', 'Pilih 1 dari 6 desain struk pembayaran (termasuk rincian diskon per item).'],
    laporan_kasir: ['Laporan Kasir', 'Pilih format laporan rekap shift kasir yang sesuai dengan kebutuhan toko Anda.'],
    penerimaan: ['Penerimaan Barang (ReceiveItem A4)', 'Format bukti penerimaan barang dari pemasok.'],
    penyesuaian: ['Penyesuaian Stok (StockAdjustment A4)', 'Format berita acara penyesuaian kuantitas stok persediaan.'],
    produksi: ['Produksi Harian (Production A4)', 'Format laporan produksi / perakitan paket barang harian.']
  };
  document.getElementById('strukDocTitle').textContent = meta[docType][0];
  document.getElementById('strukDocSubtitle').textContent = meta[docType][1];
  renderStrukDocPreview();
}

function normalizeStrukTemplateVal(raw) {
  const val = String(raw || 'RENE_MINIMARKET_58').toUpperCase();
  if (val === '58MM' || val === '58') return 'RENE_MINIMARKET_58';
  if (val === '80MM' || val === '80') return 'RENE_GROSIR_80';
  if (val === 'A4') return 'RENE_INVOICE_A4';
  return val;
}

function renderStrukDocPreview() {
  const canvas = document.getElementById('strukPreviewCanvas');
  if (!canvas) return;
  const storeName = document.getElementById('cfgCompanyName')?.value || 'DANISH SHOP';
  const storeAddr = document.getElementById('cfgCompanyAddress')?.value || 'Jl. Raya Utama No. 44';
  const storePhone = document.getElementById('cfgCompanyPhone')?.value || '0812-7361-3498';
  const tpl = normalizeStrukTemplateVal(document.getElementById('strukPaperSizeSelect')?.value);

  const is80 = tpl === 'RENE_GROSIR_80';
  const isA4 = tpl === 'RENE_INVOICE_A4';
  const wThermal = is80 ? '300px' : '225px';
  const showTax = document.getElementById('strukShowTaxDetail')?.checked;
  const showPoint = document.getElementById('strukShowMemberPoint')?.checked;
  const showOrder = document.getElementById('strukPrintOrderSlip')?.checked;

  if (activeStrukDocType === 'pembayaran') {
    if (isA4) {
      canvas.innerHTML = `
        <div style="background:#fff; width:100%; max-width:660px; padding:22px; font-family:sans-serif; font-size:12px; color:#000; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
          <div style="display:flex; justify-content:space-between; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:10px;">
            <div>
              <div style="font-size:16px; font-weight:800;">${storeName}</div>
              <div>${storeAddr} • Telp. ${storePhone}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:15px; font-weight:800;">FAKTUR PENJUALAN</div>
              <div>No#: STRUK# 001 | Tgl: 24-11-2026</div>
            </div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:12px;">
            <thead>
              <tr style="border-top:1px solid #000; border-bottom:1px solid #000;">
                <th style="text-align:left; padding:5px 0;">Nama Barang</th>
                <th style="text-align:right; padding:5px;">Qty</th>
                <th style="text-align:right; padding:5px;">Harga</th>
                <th style="text-align:right; padding:5px;">Diskon</th>
                <th style="text-align:right; padding:5px 0;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px dashed #ccc;">
                <td style="padding:5px 0;">Barang/Menu Promo #1</td>
                <td style="text-align:right;">3</td>
                <td style="text-align:right;">3.000</td>
                <td style="text-align:right; color:#DC2626;">-2.000</td>
                <td style="text-align:right;">7.000</td>
              </tr>
              <tr style="border-bottom:1px dashed #ccc;">
                <td style="padding:5px 0;">Barang/Menu #2</td>
                <td style="text-align:right;">4</td>
                <td style="text-align:right;">3.000</td>
                <td style="text-align:right;">0</td>
                <td style="text-align:right;">12.000</td>
              </tr>
            </tbody>
          </table>
          <div style="display:flex; justify-content:space-between;">
            <div style="font-size:11px;">Kasir: Administrator<br>Total Hemat: <strong>Rp 2.000</strong></div>
            <table style="width:220px; border-collapse:collapse; font-size:12px;">
              <tr><td>Subtotal</td><td style="text-align:right;">21.000</td></tr>
              <tr><td>Diskon Item</td><td style="text-align:right;">-2.000</td></tr>
              <tr style="font-weight:800; border-top:1px solid #000;"><td>GRAND TOTAL</td><td style="text-align:right;">19.000</td></tr>
            </table>
          </div>
        </div>`;
      return;
    }

    // Header khusus Resto / Hemat / Standar
    let headerExtra = '';
    if (tpl === 'RENE_RESTO_58') {
      headerExtra = `<div style="text-align:center; font-weight:bold; border:1px solid #000; padding:3px; margin:4px 0;">MEJA: 05 • DINE-IN</div>`;
    }

    // Bagian Daftar Barang sesuai template
    let itemsBlock = '';
    if (tpl === 'RENE_PROMO_DISKON_58' || tpl === 'RENE_GROSIR_80') {
      itemsBlock = `
        <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:10.5px;">
          <colgroup><col style="width:65%;"><col style="width:35%;"></colgroup>
          <tr style="border-bottom:1px dashed #000;">
            <th style="text-align:left;">Nama Barang</th>
            <th style="text-align:right;">Total</th>
          </tr>
          <tr><td colspan="2" style="font-weight:bold; padding-top:3px;">Barang/Menu Promo #1</td></tr>
          <tr>
            <td style="padding-left:4px;">3 PCS x 3.000</td>
            <td style="text-align:right;">9.000 *</td>
          </tr>
          <tr>
            <td style="padding-left:8px; font-style:italic;">Disc. Item</td>
            <td style="text-align:right;">-2.000</td>
          </tr>
          <tr><td colspan="2" style="font-weight:bold; padding-top:3px;">Barang/Menu #2</td></tr>
          <tr>
            <td style="padding-left:4px;">4 PCS x 3.000</td>
            <td style="text-align:right;">12.000 *</td>
          </tr>
        </table>`;
    } else {
      itemsBlock = `
        <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:10.5px;">
          <colgroup><col style="width:66%;"><col style="width:34%;"></colgroup>
          <tr>
            <th style="text-align:left;">Kts Nama Barang</th>
            <th style="text-align:right;">Jumlah</th>
          </tr>
          <tr><td>3 Barang/Menu #1</td><td style="text-align:right;">7.000 *</td></tr>
          <tr><td>4 Barang/Menu #2</td><td style="text-align:right;">12.000 *</td></tr>
        </table>`;
    }

    canvas.innerHTML = `
      <div style="background:#fff; width:${wThermal}; padding:12px; font-family:'Courier New', monospace; font-size:10.5px; line-height:1.35; color:#000; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
        <div style="text-align:center; font-weight:700;">${storeName}</div>
        ${tpl !== 'RENE_HEMAT_58' ? `<div style="text-align:center;">${storeAddr}</div>` : ''}
        <div style="text-align:center; margin-bottom:4px;">Telp. ${storePhone}</div>
        ${headerExtra}
        <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; padding:3px 0; margin-bottom:4px; font-size:10px;">
          ${tpl === 'RENE_HEMAT_58'
            ? `<div>STRUK#001 | 24/11/26 20:06 | Adm</div>`
            : `<div>No# : STRUK# 001</div><div>Kasir : Administrator</div><div>Tanggal : 24-11-2026 20:06</div>`}
        </div>
        ${itemsBlock}
        <div style="border-top:1px dashed #000; margin-top:4px; padding-top:4px;">
          <div>Total barang dibeli 7</div>
          <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:10.5px;">
            <colgroup><col style="width:60%;"><col style="width:40%;"></colgroup>
            <tr><td>SUBTOTAL</td><td style="text-align:right;">${tpl === 'RENE_PROMO_DISKON_58' ? '21.000' : '19.000'}</td></tr>
            ${tpl === 'RENE_PROMO_DISKON_58' ? `<tr><td>DISKON ITEM</td><td style="text-align:right;">-2.000</td></tr>` : `<tr><td>DISKON</td><td style="text-align:right;">0</td></tr>`}
            <tr><td>PEMBULATAN</td><td style="text-align:right;">-20</td></tr>
            <tr style="font-weight:700; border-top:1px dashed #000;"><td>TOTAL</td><td style="text-align:right;">21.450</td></tr>
            <tr><td>TUNAI</td><td style="text-align:right;">25.000</td></tr>
            <tr><td>KEMBALI</td><td style="text-align:right;">3.550</td></tr>
          </table>
          ${tpl === 'RENE_PROMO_DISKON_58' ? `<div style="text-align:center; font-weight:bold; border:1px dashed #000; padding:2px; margin-top:4px;">ANDA HEMAT : Rp 2.000</div>` : ''}
        </div>
        ${showTax ? `
        <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:9.5px; border-top:1px dashed #000; margin-top:4px; padding-top:4px;">
          <colgroup><col style="width:24%;"><col style="width:20%;"><col style="width:28%;"><col style="width:28%;"></colgroup>
          <tr><th style="text-align:left;">PAJAK</th><th style="text-align:left;">TARIF</th><th style="text-align:right;">DPP</th><th style="text-align:right;">PPN</th></tr>
          <tr><td>*</td><td>11%</td><td style="text-align:right;">19.000</td><td style="text-align:right;">2.090</td></tr>
        </table>` : ''}
        ${showPoint ? `<div style="border-top:1px dashed #000; margin-top:4px; padding-top:4px; text-align:center; font-size:9.5px;">POIN DIDAPAT: +3 | SALDO POIN: 15</div>` : ''}
        <div style="text-align:center; border-top:1px dashed #000; margin-top:6px; padding-top:4px; font-size:9.5px;">TERIMA KASIH<br># Barang yang sudah dibeli tidak dapat ditukar/dikembalikan</div>
      </div>
      ${showOrder ? `
      <div style="background:#fff; width:210px; padding:12px; font-family:'Courier New', monospace; font-size:10.5px; line-height:1.4; align-self:flex-start; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
        <div><strong>ID : Umum</strong></div>
        <div style="text-align:center; font-size:13px; font-weight:700; margin:6px 0; border-top:1px dashed #000; border-bottom:1px dashed #000; padding:4px 0;">PESANAN / DELIVERY</div>
        <div>3 Barang/Menu #1</div>
        <div>4 Barang/Menu #2</div>
        <div style="border-top:1px dashed #000; margin-top:6px; padding-top:4px;">Total Menu 7</div>
        <div style="margin-top:6px;">STRUK# 001<br>Administrator 24-11-2026</div>
      </div>` : ''}
    `;
  } else if (activeStrukDocType === 'laporan_kasir') {
    canvas.innerHTML = `
      <div style="background:#fff; width:${wThermal}; padding:12px; font-family:'Courier New', monospace; font-size:10.5px; line-height:1.4; color:#000; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
        <div style="text-align:center; font-weight:700; border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:6px;">LAPORAN SHIFT KASIR</div>
        <div>KASIR  : Administrator</div>
        <div>LOGIN  : 24-11-2026 07.00</div>
        <div style="border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:6px;">DICETAK: 24-11-2026 20.07</div>
        <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
          <tr style="font-weight:700;"><td>TOTAL BELANJA :</td><td style="text-align:right;">21.450</td></tr>
          <tr><td colspan="2" style="padding-top:6px; font-weight:700;">PEMBAYARAN</td></tr>
          <tr><td>&nbsp;Tunai :</td><td style="text-align:right;">21.450</td></tr>
          <tr><td>&nbsp;QRIS / EDC :</td><td style="text-align:right;">0</td></tr>
          <tr><td colspan="2" style="padding-top:6px; font-weight:700;">SETORAN</td></tr>
          <tr><td>&nbsp;Setor Awal :</td><td style="text-align:right;">100.000</td></tr>
          <tr><td>&nbsp;Pembayaran Tunai :</td><td style="text-align:right;">21.450</td></tr>
          <tr style="font-weight:700; border-top:1px dashed #000;"><td>TOTAL SETORAN :</td><td style="text-align:right;">121.450</td></tr>
        </table>
      </div>`;
  } else {
    const titleMap = {
      penerimaan: 'PENERIMAAN BARANG',
      penyesuaian: 'PENYESUAIAN STOK',
      produksi: 'PRODUKSI HARIAN'
    };
    const colMap = {
      penerimaan: '<th>No</th><th>Kode Barang</th><th>Nama Barang</th><th>Kuantitas</th><th>Satuan</th>',
      penyesuaian: '<th>No</th><th>Kode Barang</th><th>Nama Barang</th><th>Kts Perubahan</th><th>Satuan</th>',
      produksi: '<th>No</th><th>Kode Paket</th><th>Nama Produksi</th><th>Qty Hasil</th><th>Satuan</th>'
    };
    canvas.innerHTML = `
      <div style="background:#fff; width:100%; max-width:650px; min-height:380px; padding:24px; font-family:sans-serif; font-size:12px; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
        <div style="font-size:16px; font-weight:800; margin-bottom:12px;">${titleMap[activeStrukDocType]}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:14px; font-size:11px;">
          <div>No#      : DOC-20261124-001<br>Operator : Administrator<br>Tanggal  : 24-11-2026</div>
          <div>Keterangan : Dokumen operasional ${storeName}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead><tr style="border-top:1px solid #0f172a; border-bottom:1px solid #0f172a;">${colMap[activeStrukDocType]}</tr></thead>
          <tbody>
            <tr><td>1</td><td>SKU-1001</td><td>Contoh Barang Persediaan</td><td>10</td><td>PCS</td></tr>
          </tbody>
        </table>
      </div>`;
  }
}

function printStrukSampleTest() {
  const area = document.getElementById('stockAdjPrintArea');
  const canvas = document.getElementById('strukPreviewCanvas');
  if (!area || !canvas) return;
  const tpl = normalizeStrukTemplateVal(document.getElementById('strukPaperSizeSelect')?.value);
  const wCss = tpl === 'RENE_INVOICE_A4' ? '190mm' : tpl === 'RENE_GROSIR_80' ? '70mm' : '44mm';
  area.innerHTML = `<div style="width:${wCss}; max-width:${wCss}; margin:0 auto;">${canvas.innerHTML}</div>`;
  area.classList.add('printing');
  window.print();
  setTimeout(() => area.classList.remove('printing'), 500);
}

/* --- SUB-MODUL 3: CETAK LABEL HARGA & RAK --- */
function initDesignLabelCatalog() {
  const catSel = document.getElementById('lblCategorySelect');
  const masterCat = document.getElementById('masterCategoryFilter');
  if (catSel && masterCat && catSel.options.length <= 1) {
    catSel.innerHTML = masterCat.innerHTML;
  }
  if (!MASTER_PRODUCTS_CACHE || MASTER_PRODUCTS_CACHE.length === 0) {
    const cached = getAdminCache('PRODUCTS');
    if (cached) MASTER_PRODUCTS_CACHE = cached;
  }
  filterDesignLabelProducts();
}

function filterDesignLabelProducts() {
  const listEl = document.getElementById('lblProductChecklist');
  if (!listEl) return;
  const kw = (document.getElementById('lblProductSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('lblCategorySelect')?.value || '';
  const items = (typeof MASTER_PRODUCTS_CACHE !== 'undefined' ? MASTER_PRODUCTS_CACHE : [])
    .filter(p => {
      const matchKw = !kw || String(p.sku || '').toLowerCase().includes(kw) || String(p.nama || '').toLowerCase().includes(kw);
      const matchCat = !cat || String(p.kategori || '') === cat;
      return matchKw && matchCat;
    })
    .slice(0, 60);

  if (!items.length) {
    listEl.innerHTML = '<div style="color:#94a3b8; padding:8px;">Tidak ada data barang.</div>';
    return;
  }

  listEl.innerHTML = items.map(p => `
    <label style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:4px 6px; border-bottom:1px solid #F1F5F9; cursor:pointer;">
      <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <input type="checkbox" class="dsg-lbl-chk" value="${p.sku}" data-nama="${p.nama}" data-harga="${p.hargaJual || 0}" data-barcode="${p.barcode || p.sku}" style="width:14px; height:14px;">
        <span>${p.nama}</span>
      </span>
      <input type="number" class="dsg-lbl-qty" data-sku="${p.sku}" value="1" min="1" max="50" style="width:48px; padding:2px 4px; text-align:center; font-size:11px;">
    </label>
  `).join('');
}

function renderLabelPreviewSheet() {
  const paper = document.getElementById('lblPrintPaper');
  if (!paper) return;
  const model = document.getElementById('lblModelSelect')?.value || 'PRICE_TAG_2';
  const cols = model.includes('_1') || model.startsWith('LABEL_') ? 1 : (model.includes('_3') ? 3 : (model.includes('_4') ? 4 : 2));
  const isRackTag = model.startsWith('RACK_TAG');
  paper.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  const checked = Array.from(document.querySelectorAll('.dsg-lbl-chk:checked'));
  const cards = [];

  if (!checked.length) {
    for (let i = 1; i <= cols * 2; i++) {
      cards.push({ sku: 'SKU-100' + i, barcode: '89910020030' + i, nama: 'CONTOH BARANG #' + i, harga: 15000 * i });
    }
  } else {
    checked.forEach(chk => {
      const qtyInput = document.querySelector(`.dsg-lbl-qty[data-sku="${chk.value}"]`);
      const qty = Math.max(1, Number(qtyInput?.value || 1));
      for (let q = 0; q < qty; q++) {
        cards.push({
          sku: chk.value,
          barcode: chk.dataset.barcode || chk.value,
          nama: chk.dataset.nama,
          harga: Number(chk.dataset.harga || 0)
        });
      }
    });
  }

  paper.innerHTML = cards.map(c => isRackTag ? `
    <div style="border:2px solid #0F172A; border-radius:6px; overflow:hidden; background:#fff;">
      <div style="background:#FACC15; color:#0F172A; font-weight:800; font-size:11px; padding:4px 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.nama}</div>
      <div style="padding:6px 8px; display:flex; justify-content:space-between; align-items:flex-end;">
        <span style="font-size:10px; font-family:monospace;">${c.barcode}</span>
        <span style="font-size:18px; font-weight:900; color:#DC2626;">Rp ${c.harga.toLocaleString('id-ID')}</span>
      </div>
    </div>
  ` : `
    <div style="border:1px dashed #64748B; border-radius:6px; padding:8px; text-align:center; background:#fff;">
      <div style="font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.nama}</div>
      <div style="font-family:monospace; font-size:10px; color:#475569; margin:2px 0;">|||| || ||| |||| (${c.barcode})</div>
      <div style="font-size:16px; font-weight:900; color:#0F172A;">Rp ${c.harga.toLocaleString('id-ID')}</div>
    </div>
  `).join('');
}

function printDesignLabelsNow() {
  renderLabelPreviewSheet();
  const area = document.getElementById('priceTagPrintArea');
  const paper = document.getElementById('lblPrintPaper');
  if (!area || !paper) return;
  area.innerHTML = paper.innerHTML;
  area.style.gridTemplateColumns = paper.style.gridTemplateColumns;
  area.classList.add('printing');
  window.print();
  setTimeout(() => area.classList.remove('printing'), 500);
}

async function saveAdminQrisConfig() {
  const kodeToko = document.getElementById('storeFilterSelect')?.value || SESSION.store.kodeToko;
  const payload = {
    kodeToko,
    mode: document.getElementById('cfgQrisMode').value,
    gatewayProvider: document.getElementById('cfgQrisProvider').value,
    staticPayload: document.getElementById('cfgQrisStaticPayload').value.trim(),
    serverKey: document.getElementById('cfgQrisServerKey').value.trim(),
    isProduction: document.getElementById('cfgQrisIsProd').checked
  };
  localStorage.setItem('DANISH_STATIC_QRIS_' + kodeToko, payload.staticPayload);
  try {
    const res = await ApiClient.call('admin/save-qris', payload);
    alert(res.message);
  } catch (e) {
    alert('Tersimpan lokal, gagal sinkron cloud: ' + e.message);
  }
}
// === FOOTER LIVE CLOCK & STORE SYNC ===
(function initModernFooter() {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Fungsi sinkronisasi nama toko ke footer
  function syncFooterStoreName() {
    const storeInput = document.getElementById('cfgStoreName');
    const footerStore = document.getElementById('footerStoreName');
    if (storeInput && footerStore && storeInput.value.trim()) {
      footerStore.textContent = storeInput.value.trim();
    }
  }

  // Jalankan saat halaman siap & saat input nama toko diubah
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(syncFooterStoreName, 500); // Beri jeda agar data config selesai dimuat
    const storeInput = document.getElementById('cfgStoreName');
    if (storeInput) {
      storeInput.addEventListener('input', syncFooterStoreName);
    }
  });

  // Jam digital real-time
  function updateFooterClock() {
    const clockEl = document.getElementById('footerClock');
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  updateFooterClock();
  setInterval(updateFooterClock, 1000);

  // Deteksi status koneksi internet / offline mode otomatis
  function updateConnectionStatus() {
    const badge = document.getElementById('footerSyncBadge');
    const dot = document.getElementById('footerSyncDot');
    const text = document.getElementById('footerSyncText');
    if (!badge || !dot || !text) return;

    if (navigator.onLine) {
      badge.style.background = '#ecfdf5';
      badge.style.color = '#065f46';
      badge.style.borderColor = '#a7f3d0';
      dot.style.background = '#10b981';
      text.textContent = 'Server & Cloud Aktif';
    } else {
      badge.style.background = '#fef2f2';
      badge.style.color = '#991b1b';
      badge.style.borderColor = '#fecaca';
      dot.style.background = '#ef4444';
      text.textContent = 'Mode Offline Lokal';
    }
  }

  updateConnectionStatus();
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
})();

// Fungsi untuk mengunggah & mengompres gambar lokal ke Base64
function handleProductImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      // Kompres ukuran gambar maksimal 400x400px agar ringan di database
      const canvas = document.createElement('canvas');
      const maxSize = 400;
      let width = img.width;
      let height = img.height;

      if (width > height && width > maxSize) {
        height *= maxSize / width;
        width = maxSize;
      } else if (height > maxSize) {
        width *= maxSize / height;
        height = maxSize;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
      
      // Masukkan hasil ke input URL gambar & perbarui preview
      const urlInput = document.getElementById('itemImageUrl'); // sesuaikan ID input Anda
      if (urlInput) urlInput.value = compressedBase64;
      updateProductImagePreview(compressedBase64);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function updateProductImagePreview(src) {
  const imgEl = document.getElementById('itemPreviewImg'); // sesuaikan ID tag <img>
  const placeholderEl = document.getElementById('itemPreviewPlaceholder'); // teks placeholder

  if (!src || !src.trim()) {
    if (imgEl) {
      imgEl.style.display = 'none';
      imgEl.removeAttribute('src');
    }
    if (placeholderEl) {
      placeholderEl.textContent = 'Belum ada gambar';
      placeholderEl.style.display = 'block';
    }
    return;
  }

  if (imgEl) {
    imgEl.onload = function () {
      imgEl.style.display = 'block';
      if (placeholderEl) placeholderEl.style.display = 'none';
    };
    imgEl.onerror = function () {
      imgEl.style.display = 'none';
      if (placeholderEl) {
        placeholderEl.textContent = 'Gambar gagal dimuat (Pastikan URL langsung ke file .jpg/.png)';
        placeholderEl.style.display = 'block';
      }
    };
    imgEl.src = src.trim();
  }
}