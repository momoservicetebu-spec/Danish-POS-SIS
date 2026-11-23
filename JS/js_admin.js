// JS/js_admin.js - Logika Backoffice & Admin SIS v3.5 (Enterprise Edition + Mobile Responsive + Loading Screen)
let PENDING_TAGS_CACHE = [];
let MASTER_PRODUCTS_CACHE = [];
let SELECTED_BARCODE_SKUS = new Set();
let LAST_SALES_REPORT_CACHE = null;

if (SESSION) {
  document.getElementById('storeTitle').textContent = `${SESSION.store.namaToko} (${SESSION.store.kodeToko})`;
  document.getElementById('userBadge').textContent = `${SESSION.user.nama} [${SESSION.user.role}]`;
}

// === KONTROL SIDEBAR RESPONSIF (DESKTOP / TABLET / HP) ===
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

// Otomatis bungkus semua tabel agar bisa digeser horizontal di HP
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
                        !endpoint.includes('list') && !endpoint.includes('report') &&
                        !endpoint.includes('stok-toko') && !endpoint.includes('stock-card') &&
                        !endpoint.includes('users');
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
  document.getElementById(modalId).classList.remove('open');
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  if (btn) btn.classList.add('active');
  closeMobileSidebar();

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'master') loadMasterCatalog();
  if (tabName === 'members') loadMembersTable();
  if (tabName === 'suppliers') loadSuppliersTable();
  if (tabName === 'reports') initAndLoadReport();
  if (tabName === 'so') loadBlindSOItems();
  if (tabName === 'users') loadUsersTable();
}

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

    // Render 8 Grafik & Widget Analitik Dashboard
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

    // Render Tabel Stok Menipis + Tombol Auto-PO
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

    // Render Tabel Watchlist Kedaluwarsa (FEFO)
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

    // Render Tabel Monitor Anomali & Investigasi Fraud
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
  // 1. Sales Overview Line Chart (SVG murni)
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

  // 2. Sales by Category Donut Chart
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

  // 3. Collection Summary (Today)
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

  // 4. Top 5 Best Selling Items
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

  // 5. Stock Summary
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

  // 6. Monthly Profit Trend Bar Chart
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

  // 7. Recent Transactions Feed
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

  // 8. Branch Wise Sales Horizontal Bars
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
  if (supplierTabBtn) {
    switchTab('suppliers', supplierTabBtn);
  }
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

// === MASTER BARANG, KARTU STOK & BARCODE STUDIO ===
function loadMasterCatalog() {
  callAdminApi('admin/products', {}, items => {
    MASTER_PRODUCTS_CACHE = items || [];
    renderMasterCatalogTable(MASTER_PRODUCTS_CACHE);
  }, 'Memuat Katalog Barang...');
}

function renderMasterCatalogTable(items) {
  const tbody = document.getElementById('masterCatalogBody');
  tbody.innerHTML = items.map(p => `
    <tr>
      <td>
        <input type="checkbox" class="barcode-chk" value="${p.sku}"
          ${SELECTED_BARCODE_SKUS.has(p.sku) ? 'checked' : ''}
          onchange="toggleSingleBarcodeCheckbox('${p.sku}', this.checked)">
      </td>
      <td><strong>${p.sku}</strong></td>
      <td><code>${p.barcode}</code></td>
      <td>${p.nama}</td>
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
  if (!confirm(`Yakin ingin menghapus barang ini dari katalog?\n\nSKU: ${sku}\nNama: ${nama}`)) {
    return;
  }
  callAdminApi('admin/delete-product', { sku, nama }, res => {
    SELECTED_BARCODE_SKUS.delete(sku);
    alert(res.message);
    loadMasterCatalog();
  }, 'Menghapus Barang...');
}

function filterMasterCatalog() {
  const q = (document.getElementById('masterSearchInput').value || '').toLowerCase().trim();
  if (!q) return renderMasterCatalogTable(MASTER_PRODUCTS_CACHE);
  const filtered = MASTER_PRODUCTS_CACHE.filter(p =>
    p.sku.toLowerCase().includes(q) ||
    String(p.barcode).toLowerCase().includes(q) ||
    p.nama.toLowerCase().includes(q)
  );
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
  document.getElementById('prdSku').value = p.sku;
  document.getElementById('prdBarcode').value = p.barcode;
  document.getElementById('prdNama').value = p.nama;
  document.getElementById('prdKategori').value = p.kategori;
  document.getElementById('prdSatuan').value = p.satuan;
  document.getElementById('prdModal').value = p.hargaModal || '';
  document.getElementById('prdJual').value = p.hargaJual;
  document.getElementById('prdHighRisk').value = String(p.isHighRisk);
}

function submitProduct() {
  const payload = {
    sku: document.getElementById('prdSku').value,
    barcode: document.getElementById('prdBarcode').value,
    nama: document.getElementById('prdNama').value,
    kategori: document.getElementById('prdKategori').value,
    satuan: document.getElementById('prdSatuan').value || 'PCS',
    hargaModal: Number(document.getElementById('prdModal').value) || 0,
    hargaJual: Number(document.getElementById('prdJual').value) || 0,
    isHighRisk: document.getElementById('prdHighRisk').value === 'true'
  };
  callAdminApi('admin/save-product', payload, res => {
    alert(res.message);
    loadMasterCatalog();
  }, 'Menyimpan Master Barang...');
}

function submitPromo() {
  const payload = {
    jenisPromo: document.getElementById('prmJenis').value,
    barcodeSyarat: document.getElementById('prmBarcodeSyarat').value,
    minQty: Number(document.getElementById('prmMinQty').value) || 1,
    barcodeHadiah: document.getElementById('prmBarcodeHadiah').value,
    hargaPromo: Number(document.getElementById('prmHarga').value) || 0,
    tglMulai: document.getElementById('prmMulai').value,
    tglSelesai: document.getElementById('prmSelesai').value
  };
  callAdminApi('admin/save-promo', payload, res => {
    alert(res.message);
    document.getElementById('prmBarcodeSyarat').value = '';
    document.getElementById('prmHarga').value = '';
  }, 'Menyimpan Aturan Promo...');
}

// === MEMBER & PIUTANG PELANGGAN (RENE CRM) ===
function loadMembersTable() {
  callAdminApi('member/list', {}, members => {
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = members.map(m => `
      <tr>
        <td><strong>${m.member_id}</strong></td>
        <td><code>${m.card_code}</code></td>
        <td>${m.name}</td>
        <td>${m.phone}</td>
        <td><span class="badge badge-ok">${m.price_level}</span></td>
        <td>${m.member_discount_pct}%</td>
        <td><strong>${m.points.toLocaleString('id-ID')}</strong> pt</td>
        <td>Rp ${m.credit_limit.toLocaleString('id-ID')}</td>
        <td style="color:${m.current_debt > 0 ? '#DC2626' : '#0F172A'}; font-weight:700;">
          Rp ${m.current_debt.toLocaleString('id-ID')}
        </td>
        <td style="display:flex; gap:6px;">
          <button class="btn btn-blue btn-sm" onclick='fillMemberForm(${JSON.stringify(m)})'>Edit</button>
          ${m.current_debt > 0 ? `<button class="btn btn-amber btn-sm" onclick="payDebtModal('${m.member_id}', '${m.name}', ${m.current_debt})">Bayar Piutang</button>` : ''}
        </td>
      </tr>
    `).join('');
  }, 'Memuat Data Member...');
}

function fillMemberForm(m) {
  document.getElementById('mbrCardCode').value = m.card_code;
  document.getElementById('mbrNama').value = m.name;
  document.getElementById('mbrPhone').value = m.phone;
  document.getElementById('mbrLevel').value = m.price_level;
  document.getElementById('mbrDiscountPct').value = m.member_discount_pct;
  document.getElementById('mbrCreditLimit').value = m.credit_limit;
}

function submitMemberAdmin() {
  const payload = {
    cardCode: document.getElementById('mbrCardCode').value,
    nama: document.getElementById('mbrNama').value,
    phone: document.getElementById('mbrPhone').value,
    priceLevel: document.getElementById('mbrLevel').value,
    discountPct: Number(document.getElementById('mbrDiscountPct').value) || 0,
    creditLimit: Number(document.getElementById('mbrCreditLimit').value) || 0
  };
  callAdminApi('member/save', payload, res => {
    alert(res.message);
    document.getElementById('mbrCardCode').value = '';
    document.getElementById('mbrNama').value = '';
    document.getElementById('mbrPhone').value = '';
    loadMembersTable();
  }, 'Menyimpan Data Member...');
}

function payDebtModal(memberId, memberName, currentDebt) {
  const amountStr = prompt(`PELUNASAN PIUTANG MEMBER\nPelanggan: ${memberName}\nSisa Piutang: Rp ${currentDebt.toLocaleString('id-ID')}\n\nMasukkan nominal pembayaran (Rp):`, currentDebt);
  if (!amountStr) return;
  const amountPaid = Number(amountStr) || 0;
  if (amountPaid <= 0) return alert('Nominal pembayaran tidak valid.');

  const note = prompt('Catatan / No. Referensi Pembayaran (Tunai / Transfer):', 'Pelunasan di toko') || '-';
  callAdminApi('member/pay-debt', { memberId, amountPaid, note }, res => {
    alert(res.message);
    loadMembersTable();
  }, 'Memproses Pelunasan Piutang...');
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
  const today = new Date().toISOString().slice(0, 10);
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

// === BLIND STOCK OPNAME (DENGAN BARCODE SCANNER) ===
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

// =========================================================
// MASTER KATEGORI BARANG (ADAPTASI RENE POS)
// =========================================================
let cachedCategories = [];

async function loadCategoriesAdmin() {
  const res = await apiCall('getCategories', {});
  if (res && res.success) {
    cachedCategories = res.data || [];
  } else {
    // Fallback default jika sheet Categories belum terisi
    cachedCategories = [{ id: 'CAT-01', nama: 'Umum', lokasi: '- Tidak Pakai -' }];
  }
  renderCategoryTable();
  populateCategoryDropdown();
}

function renderCategoryTable() {
  const tbody = document.getElementById('categoryTableBody');
  const badge = document.getElementById('totalKategoriBadge');
  if (!tbody) return;

  if (badge) badge.textContent = cachedCategories.length + ' Kategori';

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
        <button class="btn btn-blue btn-sm" onclick="editCategoryForm('${c.id}')">Edit</button>
        ${c.nama.toLowerCase() !== 'umum' ? `<button class="btn btn-red btn-sm" onclick="deleteCategoryAdmin('${c.id}', '${c.nama}')">Hapus</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function populateCategoryDropdown() {
  const select = document.getElementById('prdKategori');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = cachedCategories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('');
  if (currentVal && cachedCategories.some(c => c.nama === currentVal)) {
    select.value = currentVal;
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

async function submitCategory(isSaveAndNew) {
  const id = document.getElementById('catId').value.trim();
  const nama = document.getElementById('catNama').value.trim();
  const lokasi = document.getElementById('catLokasi').value;

  if (!nama) {
    alert('Nama Kategori wajib diisi!');
    document.getElementById('catNama').focus();
    return;
  }

  showLoading('Menyimpan Kategori...', 'Memperbarui Master Kategori Barang');
  const res = await apiCall('saveCategory', { id, nama, lokasi });
  hideLoading();

  if (res && res.success) {
    await loadCategoriesAdmin();
    if (isSaveAndNew) {
      resetCategoryForm();
      document.getElementById('catNama').focus();
    } else {
      resetCategoryForm();
      alert('Kategori "' + nama + '" berhasil disimpan.');
    }
  } else {
    alert(res ? res.message : 'Gagal menyimpan kategori.');
  }
}

async function deleteCategoryAdmin(id, nama) {
  if (!confirm('Hapus kategori "' + nama + '"?')) return;
  showLoading('Menghapus Kategori...', 'Memproses penghapusan data');
  const res = await apiCall('deleteCategory', { id });
  hideLoading();

  if (res && res.success) {
    await loadCategoriesAdmin();
  } else {
    alert(res ? res.message : 'Gagal menghapus kategori.');
  }
}