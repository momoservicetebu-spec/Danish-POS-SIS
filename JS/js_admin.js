// JS/js_admin.js - Logika Backoffice & Admin SIS v3.5 (Enterprise Edition + Modal Penyesuaian Stok, Set Harga, Komisi & Promo)
let PENDING_TAGS_CACHE = [];
let MASTER_PRODUCTS_CACHE = [];
let SELECTED_BARCODE_SKUS = new Set();
let LAST_SALES_REPORT_CACHE = null;
let cachedCategories = [];

// State untuk Modal Penyesuaian Stok, Set Harga, dan Komisi
let STOCK_ADJ_ROWS = [];
let SET_HARGA_ROWS = [];
let MEMBERS_CACHE = [];
let KOMISI_ROWS = [];

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

// === GLOBAL LOADING SCREEN ===
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

async function callAdminApi(endpoint, payload, onSuccess, loadingLabel) {
  const isWriteAction = !endpoint.includes('dashboard') && !endpoint.includes('products') &&
                        !endpoint.includes('categories') && !endpoint.includes('list') &&
                        !endpoint.includes('report') && !endpoint.includes('stok-toko') &&
                        !endpoint.includes('stock-card') && !endpoint.includes('users');
  const title = loadingLabel || (isWriteAction ? 'Menyimpan Data...' : 'Memuat Data...');
  setLoadingScreen(true, title, 'Mohon tunggu, menghubungi server...');
  try {
    const data = await ApiClient.call(endpoint, payload || {});
    setLoadingScreen(false);
    onSuccess(data);
  } catch (err) {
    setLoadingScreen(false);
    alert('Error: ' + err.message);
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  if (btn) btn.classList.add('active');
  closeMobileSidebar();

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'master') {
    loadCategoriesAdmin();
    loadMasterCatalog();
  }
  if (tabName === 'members') loadMembersTable();
  if (tabName === 'suppliers') loadSuppliersTable();
  if (tabName === 'reports') initAndLoadReport();
  if (tabName === 'so') loadBlindSOItems();
  if (tabName === 'users') loadUsersTable();
}

// =========================================================
// DASHBOARD KPI & ANALITIK
// =========================================================
function loadDashboard() {
  if (SESSION.user.role === 'Pramuniaga') {
    document.getElementById('kpiOmzet').textContent = 'RESTRICTED';
    return;
  }

  callAdminApi('finance/dashboard', {}, data => {
    document.getElementById('kpiOmzet').textContent = 'Rp ' + data.omzetHariIni.toLocaleString('id-ID');
    document.getElementById('kpiStruk').textContent = data.jumlahStruk + ' Struk';
    document.getElementById('kpiLowStock').textContent = data.lowStockCount + ' SKU';
    document.getElementById('kpiFraud').textContent = data.flaggedFraudCount;

    renderDashboardAnalytics(data);

    const auditBody = document.getElementById('auditTableBody');
    auditBody.innerHTML = data.recentLogs.map(l => `
      <tr>
        <td>${l.waktu}</td><td>${l.toko}</td><td>${l.user}</td>
        <td><span class="badge ${l.aktivitas.includes('FAIL') || l.aktivitas.includes('BLOCK') || l.aktivitas.includes('FRAUD') ? 'badge-danger' : 'badge-ok'}">${l.aktivitas}</span></td>
        <td>${l.keterangan}</td>
      </tr>
    `).join('');

    PENDING_TAGS_CACHE = data.pendingPriceTags || [];
    const tagBody = document.getElementById('priceTagBody');
    tagBody.innerHTML = PENDING_TAGS_CACHE.map(t => `
      <tr><td>${t.sku} - ${t.nama}</td><td><strong>Rp ${Number(t.hargaBaru).toLocaleString('id-ID')}</strong></td></tr>
    `).join('') || '<tr><td colspan="2">Semua label harga sudah terbaru.</td></tr>';

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
  }, 'Memuat Dashboard KPI...');
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
  callAdminApi('admin/categories', {}, data => {
    cachedCategories = (data && data.categories) ? data.categories : [{ id: 'CAT-01', nama: 'Umum', lokasi: '- Tidak Pakai -' }];
    renderCategoryTable();
    populateCategoryDropdown();
  }, 'Memuat Kategori Barang...');
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
  callAdminApi('admin/products', {}, items => {
    MASTER_PRODUCTS_CACHE = items || [];
    populateCatalogDataList();
    filterMasterCatalog();
  }, 'Memuat Katalog Barang...');
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
      <td>${p.hargaModal !== null ? 'Rp ' + p.hargaModal.toLocaleString('id-ID') : '<span style="color:#94A3B8;">Hidden</span>'}</td>
      <td><strong>Rp ${p.hargaJual.toLocaleString('id-ID')}</strong></td>
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
        <td>Rp ${p.hargaJual.toLocaleString('id-ID')}</td>
        <td><input type="number" class="barcode-qty-inp" data-sku="${p.sku}" data-code="${primaryBarcode}" data-nama="${p.nama}" data-harga="${p.hargaJual}" value="2" min="1" max="200" style="width:85px;"></td>
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
  callAdminApi('member/list', {}, members => {
    MEMBERS_CACHE = members || [];
    filterMembersTable();
  }, 'Memuat Data Pelanggan & Piutang...');
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
function loadSuppliersTable() {
  callAdminApi('supplier/list', {}, suppliers => {
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
  }, 'Memuat Data Supplier...');
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

// === LAPORAN PENJUALAN, LABA RUGI & EKSPOR EXCEL/PDF ===
function initAndLoadReport() {
  const today = getTodayIsoDate();
  const startEl = document.getElementById('repStartDate');
  const endEl = document.getElementById('repEndDate');
  if (startEl && !startEl.value) startEl.value = today;
  if (endEl && !endEl.value) endEl.value = today;
  loadSalesProfitReport();
}

function loadSalesProfitReport() {
  const startDate = document.getElementById('repStartDate').value;
  const endDate = document.getElementById('repEndDate').value;

  callAdminApi('finance/sales-report', { startDate, endDate }, rep => {
    LAST_SALES_REPORT_CACHE = { startDate, endDate, ...rep };
    document.getElementById('repNetSales').textContent = 'Rp ' + rep.netSales.toLocaleString('id-ID');
    document.getElementById('repReturnInfo').textContent = `Retur: Rp ${rep.totalReturn.toLocaleString('id-ID')} (${rep.trxCount} Trx)`;
    document.getElementById('repTotalHpp').textContent = 'Rp ' + rep.totalHpp.toLocaleString('id-ID');
    document.getElementById('repGrossProfit').textContent = 'Rp ' + rep.grossProfit.toLocaleString('id-ID');
    document.getElementById('repPaymentBreakdown').innerHTML =
      `Tunai: <strong>Rp ${rep.payCash.toLocaleString('id-ID')}</strong> | QRIS: <strong>Rp ${rep.payQris.toLocaleString('id-ID')}</strong><br>` +
      `EDC: <strong>Rp ${rep.payEdc.toLocaleString('id-ID')}</strong> | Tempo: <strong>Rp ${rep.payTempo.toLocaleString('id-ID')}</strong>`;

    document.getElementById('repTrxTableBody').innerHTML = rep.transactions.map(t => `
      <tr>
        <td><strong>${t.trxId}</strong></td>
        <td>${t.waktu}</td>
        <td>${t.kasir}</td>
        <td><span class="badge ${t.tipe === 'RETURN' ? 'badge-danger' : 'badge-ok'}">${t.tipe}</span></td>
        <td><strong>Rp ${Number(t.total).toLocaleString('id-ID')}</strong></td>
      </tr>
    `).join('') || '<tr><td colspan="5">Tidak ada transaksi pada periode ini.</td></tr>';
  }, 'Menyusun Laporan Laba Rugi...');
}

function exportReportToExcel() {
  if (!LAST_SALES_REPORT_CACHE || !LAST_SALES_REPORT_CACHE.transactions) {
    return alert('Tampilkan laporan terlebih dahulu sebelum mengekspor.');
  }
  const r = LAST_SALES_REPORT_CACHE;
  const lines = [
    ['LAPORAN PENJUALAN & LABA RUGI', SESSION.store.namaToko],
    ['Periode', `${r.startDate} s/d ${r.endDate}`],
    ['Penjualan Bersih', r.netSales, 'Total HPP', r.totalHpp, 'Laba Kotor', r.grossProfit],
    [],
    ['No Struk', 'Waktu', 'Kasir', 'Tipe', 'Total (Rp)']
  ];
  r.transactions.forEach(t => {
    lines.push([t.trxId, t.waktu, t.kasir, t.tipe, t.total]);
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + lines.map(row => row.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Laporan_POS_${SESSION.store.kodeToko}_${r.startDate}_${r.endDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function printSalesReportPDF() {
  const repTab = document.getElementById('tab-reports');
  repTab.classList.add('printing');
  window.print();
  repTab.classList.remove('printing');
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

// === BLIND STOCK OPNAME ===
function loadBlindSOItems() {
  callAdminApi('inventory/stok-toko', { blindMode: true }, items => {
    const tbody = document.getElementById('soTableBody');
    tbody.innerHTML = items.map(item => `
      <tr id="so-row-${item.sku}">
        <td><strong>${item.sku}</strong></td>
        <td><code>${item.barcode}</code></td>
        <td>${item.nama}</td>
        <td>${item.satuan}</td>
        <td><input type="number" class="so-input" data-sku="${item.sku}" data-barcode="${item.barcode}" data-nama="${item.nama}" placeholder="0" style="width:110px;"></td>
      </tr>
    `).join('');
    const scanInp = document.getElementById('soScannerInput');
    if (scanInp) scanInp.focus();
  }, 'Memuat Daftar Stock Opname...');
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
    const row = document.getElementById('so-row-' + matchedInp.dataset.sku);
    if (row) {
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
  document.querySelectorAll('.so-input').forEach(inp => {
    if (inp.value !== '') {
      counts.push({ sku: inp.dataset.sku, stokFisik: Number(inp.value) });
    }
  });
  if (counts.length === 0) return alert('Isi minimal satu hitungan fisik barang.');

  callAdminApi('inventory/stock-opname', {
    jenisSO: document.getElementById('jenisSO').value,
    supervisorPin: document.getElementById('soPin').value,
    counts: counts
  }, res => {
    alert(res.message);
    loadBlindSOItems();
  }, 'Menyimpan Hasil Stock Opname...');
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

// === MANAJEMEN USER & DEVICE BINDING ===
function loadUsersTable() {
  callAdminApi('admin/users', {}, users => {
    const tbody = document.getElementById('usersTableBody');
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
  }, 'Memuat Daftar Pengguna...');
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

loadDashboard();

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

  // Muat katalog & supplier jika cache masih kosong agar autocomplete dan dropdown pemasok terisi
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
    }, 'Memuat Daftar Pemasok...');
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
// READ & MONITORING STOK GUDANG + RIWAYAT MUTASI
// =========================================================
function loadGudangOverview() {
  callAdminApi('admin/products', {}, items => {
    MASTER_PRODUCTS_CACHE = items || [];
    populateCatalogDataList();
    filterGudangStockTable();
  }, 'Memuat Data Stok Gudang...');
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