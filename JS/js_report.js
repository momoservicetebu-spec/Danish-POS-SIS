/**
 * ============================================================================
 * MODUL LAPORAN RENE POS STYLE — DANISH POS (JS/js_report.js)
 * ============================================================================
 */

const REPORT_CATEGORIES = [
    {
        id: 'penjualan',
        label: 'Penjualan',
        icon: '📈',
        description: 'Berisi laporan yang berkaitan dengan transaksi penjualan, performa barang, pelanggan, kasir, dan laba kotor.'
    },
    {
        id: 'penerimaan',
        label: 'Penerimaan Uang',
        icon: '💵',
        description: 'Berisi laporan terkait arus kas masuk per kasir, metode pembayaran, kartu/EDC, voucher, dan rekap shift kasir.'
    },
    {
        id: 'promo_komisi',
        label: 'Promo & Komisi',
        icon: '🏷️',
        description: 'Berisi laporan perhitungan komisi karyawan/sales, barang promo keluar, serta nilai diskon promo yang diberikan.'
    },
    {
        id: 'analisa',
        label: 'Analisa',
        icon: '📊',
        description: 'Berisi laporan analisa jam tersibuk toko, histori perubahan harga, mutasi stok, dan mutasi poin member.'
    },
    {
        id: 'data',
        label: 'Data & Log',
        icon: '🗂️',
        description: 'Berisi daftar lengkap master data (barang, pelanggan, pemasok, pengguna) serta log operasional dan penyesuaian.'
    },
    {
        id: 'tersimpan',
        label: 'Laporan Tersimpan',
        icon: '⭐',
        description: 'Kumpulan laporan favorit dengan preset filter yang telah Anda simpan untuk akses cepat harian.'
    }
];

const REPORT_CATALOG = [
    // ================= 1. PENJUALAN =================
    { id: 'sales_summary', category: 'penjualan', title: 'Ringkasan Penjualan & Laba', desc: 'Rekap total omzet kotor, diskon, omzet bersih, HPP, dan laba kotor harian.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'sales_by_item', category: 'penjualan', title: 'Penjualan per Barang', desc: 'Menampilkan total kuantitas terjual, omzet, dan margin keuntungan per produk.', needsDate: true, filterType: 'CATEGORY', source: 'sales-report' },
    { id: 'sales_item_detail', category: 'penjualan', title: 'Rincian Penjualan per Barang', desc: 'Menampilkan rincian transaksi penjualan pada masing-masing barang secara kronologis.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'top_qty_items', category: 'penjualan', title: 'Barang Paling Banyak Terjual', desc: 'Peringkat barang berdasarkan jumlah kuantitas (unit) terbanyak terjual.', needsDate: true, filterType: 'CATEGORY', source: 'sales-report' },
    { id: 'top_freq_items', category: 'penjualan', title: 'Barang Paling Sering Terjual', desc: 'Peringkat barang berdasarkan frekuensi kemunculan pada struk transaksi.', needsDate: true, filterType: 'CATEGORY', source: 'sales-report' },
    { id: 'unsold_items', category: 'penjualan', title: 'Barang Tanpa Penjualan (Dead Stock)', desc: 'Daftar barang aktif di master yang tidak memiliki transaksi penjualan pada periode terpilih.', needsDate: true, filterType: 'CATEGORY', source: 'hybrid_products' },
    { id: 'most_returned_items', category: 'penjualan', title: 'Barang Paling Banyak Dikembalikan', desc: 'Rekap item yang paling sering mengalami retur/pengembalian dari pelanggan.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'sales_by_cashier', category: 'penjualan', title: 'Penjualan Per Kasir', desc: 'Perbandingan jumlah transaksi dan total nilai penjualan yang diproses setiap kasir.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'sales_by_category', category: 'penjualan', title: 'Penjualan Per Kategori Barang', desc: 'Kontribusi omzet dan kuantitas penjualan berdasarkan kategori produk.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'sales_by_customer', category: 'penjualan', title: 'Penjualan Per Pelanggan', desc: 'Total belanja, frekuensi kunjungan, dan poin yang diperoleh masing-masing pelanggan.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'sales_by_order_type', category: 'penjualan', title: 'Penjualan per Tipe Penjualan', desc: 'Pemisahan omzet berdasarkan tipe transaksi (Reguler / Grosir / Online / Dine-in).', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'customer_visit_freq', category: 'penjualan', title: 'Frekuensi Kedatangan Pelanggan', desc: 'Analisa tingkat loyalitas dan jumlah kedatangan member dalam rentang tanggal.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'sales_by_cust_tier', category: 'penjualan', title: 'Penjualan Per Kategori Pelanggan', desc: 'Rekap penjualan berdasarkan level/tier member (Reguler, Silver, Gold, dll).', needsDate: true, filterType: 'NONE', source: 'hybrid_members' },
    { id: 'sales_chart', category: 'penjualan', title: 'Grafik Penjualan', desc: 'Visualisasi grafik tren omzet penjualan dan laba kotor harian dalam bentuk diagram.', needsDate: true, filterType: 'NONE', source: 'sales-report', hasChart: true },
    { id: 'sales_detail_invoice', category: 'penjualan', title: 'Rincian Penjualan (Per Struk)', desc: 'Daftar lengkap setiap nomor faktur/struk beserta kasir, pelanggan, metode bayar, dan total.', needsDate: true, filterType: 'CASHIER', source: 'sales-report' },
    { id: 'sales_by_supplier', category: 'penjualan', title: 'Penjualan per Pemasok', desc: 'Rekap total omzet barang terjual yang dikelompokkan berdasarkan pemasok utamanya.', needsDate: true, filterType: 'SUPPLIER', source: 'hybrid_products' },
    { id: 'sales_item_by_supplier', category: 'penjualan', title: 'Penjualan Barang per Pemasok', desc: 'Rincian kuantitas dan omzet tiap SKU yang disuplai oleh masing-masing pemasok.', needsDate: true, filterType: 'SUPPLIER', source: 'hybrid_products' },
    { id: 'sales_by_employee', category: 'penjualan', title: 'Penjualan per Karyawan', desc: 'Rekap kontribusi penjualan berdasarkan nama karyawan/sales yang melayani.', needsDate: true, filterType: 'NONE', source: 'sales-report' },

    // ================= 2. PENERIMAAN UANG =================
    { id: 'receipt_by_cashier', category: 'penerimaan', title: 'Penerimaan Per Kasir', desc: 'Total uang diterima oleh masing-masing kasir dibagi per metode pembayaran.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'receipt_by_payment_type', category: 'penerimaan', title: 'Penerimaan Per Tipe Pembayaran', desc: 'Ringkasan penerimaan Tunai (Cash), QRIS, Transfer Bank, dan Kartu Debit/Kredit.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'receipt_by_card', category: 'penerimaan', title: 'Penerimaan Per Kartu', desc: 'Rincian pembayaran non-tunai berdasarkan jenis kartu (Debit BCA, Mandiri, Visa, MasterCard).', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'receipt_by_edc', category: 'penerimaan', title: 'Penerimaan Per Mesin EDC', desc: 'Rekap settlement pembayaran berdasarkan terminal mesin EDC yang digunakan.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'voucher_payment', category: 'penerimaan', title: 'Pembayaran Voucher', desc: 'Daftar transaksi yang menggunakan potongan voucher belanja beserta nilai nominalnya.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'cashier_shift_report', category: 'penerimaan', title: 'Laporan Shift Kasir', desc: 'Rekonsiliasi modal awal, penjualan tunai, kas keluar, uang fisik laci, dan selisih shift.', needsDate: true, filterType: 'CASHIER', source: 'backend_report' },
    { id: 'cash_in_out_drawer', category: 'penerimaan', title: 'Uang Awal dan Tarik Uang (Kas Laci)', desc: 'Log kas masuk (modal awal) dan kas keluar (petty cash / setor brankas) di kasir.', needsDate: true, filterType: 'CASHIER', source: 'backend_report' },

    // ================= 3. PROMO & KOMISI =================
    { id: 'commission_by_employee', category: 'promo_komisi', title: 'Komisi per Karyawan', desc: 'Perhitungan otomatis komisi penjualan untuk setiap karyawan berdasarkan transaksi.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'promo_items_out', category: 'promo_komisi', title: 'Barang Promo yang Keluar', desc: 'Daftar produk yang terjual dengan harga promo atau paket diskon pada periode terpilih.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'promo_discount_given', category: 'promo_komisi', title: 'Nilai Diskon Promo yang Diberikan', desc: 'Total nominal potongan harga / diskon struk & item yang diberikan kepada pelanggan.', needsDate: true, filterType: 'NONE', source: 'sales-report' },

    // ================= 4. ANALISA =================
    { id: 'peak_hours_analysis', category: 'analisa', title: 'Waktu Teramai (Peak Hours)', desc: 'Analisa distribusi jumlah transaksi dan omzet per jam operasional (00:00 - 23:59).', needsDate: true, filterType: 'NONE', source: 'sales-report', hasChart: true },
    { id: 'price_history', category: 'analisa', title: 'Histori Harga Barang', desc: 'Catatan riwayat perubahan harga modal dan harga jual dari waktu ke waktu.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'stock_mutation', category: 'analisa', title: 'Mutasi Stok Barang', desc: 'Pergerakan stok awal, barang masuk, penjualan keluar, penyesuaian, dan stok akhir.', needsDate: true, filterType: 'CATEGORY', source: 'hybrid_products' },
    { id: 'member_point_mutation', category: 'analisa', title: 'Mutasi Poin Reward Pelanggan', desc: 'Rekap perolehan poin dari belanja dan penukaran (redeem) poin oleh member.', needsDate: true, filterType: 'NONE', source: 'hybrid_members' },

    // ================= 5. DATA & LOG =================
    { id: 'list_sales', category: 'data', title: 'Daftar Penjualan', desc: 'Tabel master seluruh transaksi penjualan beserta status pembayaran.', needsDate: true, filterType: 'NONE', source: 'sales-report' },
    { id: 'list_products', category: 'data', title: 'Daftar Barang', desc: 'Katalog lengkap seluruh barang aktif, barcode, kategori, harga modal, harga jual, dan stok.', needsDate: false, filterType: 'CATEGORY', source: 'cache_products' },
    { id: 'list_users', category: 'data', title: 'Daftar Pengguna', desc: 'Daftar akun pengguna sistem (Admin, Kasir, Gudang) beserta hak aksesnya.', needsDate: false, filterType: 'NONE', source: 'cache_users' },
    { id: 'list_customers', category: 'data', title: 'Daftar Pelanggan', desc: 'Database lengkap member/pelanggan, nomor HP, level tier, total belanja, dan saldo poin.', needsDate: false, filterType: 'NONE', source: 'cache_members' },
    { id: 'list_suppliers', category: 'data', title: 'Daftar Pemasok', desc: 'Database pemasok/distributor lengkap dengan kontak, alamat, dan termin pembayaran.', needsDate: false, filterType: 'NONE', source: 'cache_suppliers' },
    { id: 'list_stock_adj', category: 'data', title: 'Daftar Penyesuaian Stok', desc: 'Rekap dokumen stok opname dan penyesuaian selisih barang di gudang/toko.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'detail_stock_adj', category: 'data', title: 'Rincian Penyesuaian Stok', desc: 'Detail item per item yang mengalami penambahan atau pengurangan saat stok opname.', needsDate: true, filterType: 'NONE', source: 'backend_report' },
    { id: 'list_goods_receipt', category: 'data', title: 'Daftar Penerimaan Barang (PO)', desc: 'Rekap transaksi pembelian / barang masuk dari pemasok.', needsDate: true, filterType: 'SUPPLIER', source: 'backend_report' },
    { id: 'detail_goods_receipt', category: 'data', title: 'Rincian Penerimaan Barang', desc: 'Detail kuantitas dan harga beli per barang dari setiap faktur penerimaan pemasok.', needsDate: true, filterType: 'SUPPLIER', source: 'backend_report' },
    { id: 'list_promos', category: 'data', title: 'Daftar Promo', desc: 'Daftar aturan promo, diskon, dan masa berlaku promosi di toko.', needsDate: false, filterType: 'NONE', source: 'backend_report' },
    { id: 'list_categories', category: 'data', title: 'Daftar Kategori Barang', desc: 'Daftar seluruh kategori produk beserta jumlah SKU di setiap kategori.', needsDate: false, filterType: 'NONE', source: 'cache_products' },
    { id: 'list_login_logs', category: 'data', title: 'Daftar Login Pengguna', desc: 'Log aktivitas login/logout pengguna ke dalam aplikasi kasir dan backoffice.', needsDate: true, filterType: 'NONE', source: 'backend_report' }
];

let ACTIVE_REPORT_CATEGORY = 'penjualan';
let ACTIVE_REPORT_DEF = null;
let CURRENT_REPORT_ROWS = [];
let CURRENT_REPORT_COLUMNS = [];
let REPORT_CHART_INSTANCE = null;

function initReportModule() {
    renderReportCategorySidebar();
    selectReportCategory(ACTIVE_REPORT_CATEGORY || 'penjualan');
}

function renderReportCategorySidebar() {
    const sidebar = document.getElementById('report-category-sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = REPORT_CATEGORIES.map(cat => {
        const isActive = cat.id === ACTIVE_REPORT_CATEGORY;
        const count = cat.id === 'tersimpan'
            ? getSavedReportPresets().length
            : REPORT_CATALOG.filter(r => r.category === cat.id).length;

        return `
            <button type="button"
                onclick="selectReportCategory('${cat.id}')"
                class="pref-nav-btn ${isActive ? 'active' : ''}"
                style="display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left; padding:10px 12px; border-radius:8px; border:1px solid ${isActive ? 'var(--primary)' : 'transparent'}; background:${isActive ? '#eff6ff' : 'transparent'}; color:${isActive ? 'var(--primary)' : '#334155'}; font-weight:${isActive ? '700' : '600'}; cursor:pointer; transition:all .15s;">
                <span>${cat.icon} ${cat.label}</span>
                <span style="font-size:11px; background:${isActive ? 'var(--primary)' : '#e2e8f0'}; color:${isActive ? '#fff' : '#475569'}; padding:2px 7px; border-radius:99px;">${count}</span>
            </button>
        `;
    }).join('');
}

function selectReportCategory(categoryId) {
    ACTIVE_REPORT_CATEGORY = categoryId;
    const searchInput = document.getElementById('report-quick-search');
    if (searchInput) searchInput.value = '';

    renderReportCategorySidebar();

    const catObj = REPORT_CATEGORIES.find(c => c.id === categoryId) || REPORT_CATEGORIES[0];
    document.getElementById('rep-cat-title').textContent = `${catObj.icon} ${catObj.label}`;
    document.getElementById('rep-cat-desc').textContent = catObj.description;

    if (categoryId === 'tersimpan') {
        renderSavedReportsGrid();
        return;
    }

    const items = REPORT_CATALOG.filter(r => r.category === categoryId);
    renderReportCardsGrid(items);
}

function searchReportsCatalog(keyword) {
    const q = (keyword || '').trim().toLowerCase();
    if (!q) {
        selectReportCategory(ACTIVE_REPORT_CATEGORY);
        return;
    }

    document.getElementById('rep-cat-title').textContent = `🔍 Hasil Pencarian: "${keyword}"`;
    document.getElementById('rep-cat-desc').textContent = 'Menampilkan laporan yang cocok dari seluruh kategori.';

    const matched = REPORT_CATALOG.filter(r =>
        r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)
    );
    renderReportCardsGrid(matched);
}

function renderReportCardsGrid(items) {
    const grid = document.getElementById('report-items-grid');
    if (!grid) return;

    if (!items || items.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">Tidak ada laporan yang ditemukan.</div>`;
        return;
    }

    grid.innerHTML = items.map(rep => `
        <div onclick="openReportViewer('${rep.id}')"
             style="border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; background:#fff; cursor:pointer; transition:all .15s; display:flex; flex-direction:column; justify-content:space-between; gap:8px;"
             onmouseover="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 4px 12px rgba(37,99,235,0.08)'; this.style.transform='translateY(-1px)';"
             onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'; this.style.transform='none';">
            <div>
                <div style="font-weight:700; font-size:14px; color:#0f172a; margin-bottom:4px; display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
                    <span>${rep.title}</span>
                    <span style="color:var(--primary); font-size:13px;">↗</span>
                </div>
                <div style="font-size:12px; color:#64748b; line-height:1.45;">
                    ${rep.desc}
                </div>
            </div>
        </div>
    `).join('');
}

function renderSavedReportsGrid() {
    const grid = document.getElementById('report-items-grid');
    const presets = getSavedReportPresets();

    if (presets.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:48px 20px; color:#64748b;">
                <div style="font-size:32px; margin-bottom:8px;">⭐</div>
                <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:4px;">Belum Ada Laporan Tersimpan</div>
                <p style="font-size:13px; max-width:420px; margin:0 auto;">Buka laporan apa saja, atur rentang tanggal atau filternya, lalu klik tombol <b>"Simpan Laporan"</b> di pojok kanan atas untuk menyimpannya di sini.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = presets.map((p, idx) => `
        <div style="border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px; background:#f8fafc; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
            <div onclick="openSavedPreset(${idx})" style="cursor:pointer;">
                <div style="font-weight:800; font-size:14px; color:var(--primary); margin-bottom:4px;">⭐ ${p.customName}</div>
                <div style="font-size:12px; color:#475569;">Jenis: <b>${p.baseTitle}</b></div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Periode: ${p.startDate || '-'} s/d ${p.endDate || '-'}</div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #e2e8f0; padding-top:8px;">
                <button type="button" class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fecaca; padding:3px 8px; font-size:11px;" onclick="deleteSavedPreset(${idx})">Hapus</button>
                <button type="button" class="btn btn-primary btn-sm" style="padding:3px 12px; font-size:11px;" onclick="openSavedPreset(${idx})">Buka</button>
            </div>
        </div>
    `).join('');
}

function openReportViewer(reportId, presetOverride = null) {
    const rep = REPORT_CATALOG.find(r => r.id === reportId);
    if (!rep) return;

    ACTIVE_REPORT_DEF = rep;
    const catObj = REPORT_CATEGORIES.find(c => c.id === rep.category);

    document.getElementById('report-directory-view').style.display = 'none';
    document.getElementById('report-viewer-section').style.display = 'block';

    document.getElementById('rv-badge-cat').textContent = catObj ? catObj.label : rep.category;
    document.getElementById('rv-title').textContent = presetOverride ? presetOverride.customName : rep.title;
    document.getElementById('rv-subtitle').textContent = rep.desc;
    document.getElementById('rv-table-search').value = '';

    const dateGroup = document.getElementById('rv-filter-date-group');
    dateGroup.style.display = rep.needsDate ? 'flex' : 'none';

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fmt = d => d.toISOString().split('T')[0];

    document.getElementById('rv-start-date').value = (presetOverride && presetOverride.startDate) || fmt(firstDay);
    document.getElementById('rv-end-date').value = (presetOverride && presetOverride.endDate) || fmt(today);

    setupExtraFilterDropdown(rep.filterType, presetOverride ? presetOverride.extraFilter : 'ALL');
    runActiveReport();
}

function closeReportViewer() {
    document.getElementById('report-viewer-section').style.display = 'none';
    document.getElementById('report-directory-view').style.display = 'block';
    if (REPORT_CHART_INSTANCE) {
        REPORT_CHART_INSTANCE.destroy();
        REPORT_CHART_INSTANCE = null;
    }
}

function setupExtraFilterDropdown(filterType, selectedVal = 'ALL') {
    const wrap = document.getElementById('rv-wrap-filter-select');
    const label = document.getElementById('rv-label-filter-select');
    const select = document.getElementById('rv-filter-select');

    if (!filterType || filterType === 'NONE') {
        wrap.style.display = 'none';
        select.innerHTML = '<option value="ALL">Semua</option>';
        return;
    }

    wrap.style.display = 'block';
    let optionsHtml = '<option value="ALL">Semua</option>';

    if (filterType === 'CATEGORY') {
        label.textContent = 'Kategori Barang';
        const products = (typeof MASTER_PRODUCTS_CACHE !== 'undefined' && Array.isArray(MASTER_PRODUCTS_CACHE)) ? MASTER_PRODUCTS_CACHE : [];
        const cats = [...new Set(products.map(p => p.category || p.kategori).filter(Boolean))].sort();
        cats.forEach(c => { optionsHtml += `<option value="${c}">${c}</option>`; });
    } else if (filterType === 'SUPPLIER') {
        label.textContent = 'Pemasok';
        const sups = (typeof GUDANG_SUPPLIERS_CACHE !== 'undefined' && Array.isArray(GUDANG_SUPPLIERS_CACHE)) ? GUDANG_SUPPLIERS_CACHE : [];
        sups.forEach(s => {
            const name = s.name || s.nama || s;
            optionsHtml += `<option value="${name}">${name}</option>`;
        });
    } else if (filterType === 'CASHIER') {
        label.textContent = 'Kasir';
        const users = (typeof USERS_CACHE !== 'undefined' && Array.isArray(USERS_CACHE)) ? USERS_CACHE : [];
        users.forEach(u => {
            const name = u.name || u.nama || u.username;
            if (name) optionsHtml += `<option value="${name}">${name}</option>`;
        });
    }

    select.innerHTML = optionsHtml;
    select.value = selectedVal || 'ALL';
}

async function runActiveReport() {
    if (!ACTIVE_REPORT_DEF) return;

    const tbody = document.getElementById('rv-table-body');
    const thead = document.getElementById('rv-table-head');
    const tfoot = document.getElementById('rv-table-foot');
    const kpiBox = document.getElementById('rv-kpi-container');
    const chartBox = document.getElementById('rv-chart-container');

    thead.innerHTML = '';
    tfoot.innerHTML = '';
    kpiBox.innerHTML = '';
    chartBox.style.display = 'none';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:#64748b;">⏳ Sedang memuat dan menghitung data laporan...</td></tr>`;

    const startDate = document.getElementById('rv-start-date').value;
    const endDate = document.getElementById('rv-end-date').value;
    const extraFilter = document.getElementById('rv-filter-select').value;

    try {
        if (ACTIVE_REPORT_DEF.source.startsWith('cache_')) {
            await ensureMasterCachesLoaded();
            buildMasterCacheReport(ACTIVE_REPORT_DEF.id, extraFilter);
            return;
        }

        if (ACTIVE_REPORT_DEF.source === 'sales-report' || ACTIVE_REPORT_DEF.source.startsWith('hybrid_')) {
            await ensureMasterCachesLoaded();
            const res = await apiCall('finance/sales-report', {
                startDate: startDate,
                endDate: endDate
            });

            if (!res || res.status === 'error') {
                throw new Error(res?.message || 'Gagal mengambil data dari server.');
            }

            buildSalesAndHybridReport(ACTIVE_REPORT_DEF.id, res, { startDate, endDate, extraFilter });
            return;
        }

        const resCustom = await apiCall('reports/generate', {
            reportId: ACTIVE_REPORT_DEF.id,
            startDate: startDate,
            endDate: endDate,
            filter: extraFilter
        });

        if (resCustom && resCustom.status === 'success' && Array.isArray(resCustom.rows)) {
            renderReportResultTable(resCustom.columns, resCustom.rows, resCustom.kpis || []);
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:36px;">
                        <div style="font-size:24px; margin-bottom:8px;">🔌</div>
                        <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">Menunggu Endpoint Backend: <code>reports/generate (${ACTIVE_REPORT_DEF.id})</code></div>
                        <div style="font-size:12px; color:#64748b; max-width:480px; margin:0 auto;">
                            Antarmuka laporan dan parameter filter sudah siap. Kirimkan file <b>Code.gs</b> Anda untuk mengaktifkan penarikan data log/shift/kartu/EDC pada laporan ini.
                        </div>
                    </td>
                </tr>
            `;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#ef4444;">❌ Gagal memuat laporan: ${err.message}</td></tr>`;
    }
}

async function ensureMasterCachesLoaded() {
    if (typeof MASTER_PRODUCTS_CACHE === 'undefined' || !MASTER_PRODUCTS_CACHE.length) {
        if (typeof loadMasterProducts === 'function') await loadMasterProducts();
    }
    if (typeof MEMBERS_CACHE === 'undefined' || !MEMBERS_CACHE.length) {
        if (typeof loadMembers === 'function') await loadMembers();
    }
    if (typeof GUDANG_SUPPLIERS_CACHE === 'undefined' || !GUDANG_SUPPLIERS_CACHE.length) {
        if (typeof loadSuppliers === 'function') await loadSuppliers();
    }
}

function buildMasterCacheReport(reportId, extraFilter) {
    const fmtRp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

    if (reportId === 'list_products') {
        let list = [...(MASTER_PRODUCTS_CACHE || [])];
        if (extraFilter && extraFilter !== 'ALL') {
            list = list.filter(p => (p.category || p.kategori) === extraFilter);
        }
        const totalAsset = list.reduce((acc, p) => acc + ((Number(p.costPrice || p.modal || 0)) * (Number(p.stock || p.stok || 0))), 0);
        const totalStock = list.reduce((acc, p) => acc + (Number(p.stock || p.stok || 0)), 0);

        const cols = ['Kode / Barcode', 'Nama Barang', 'Kategori', 'Satuan', 'Harga Modal', 'Harga Jual', 'Stok', 'Nilai Aset'];
        const rows = list.map(p => {
            const modal = Number(p.costPrice || p.modal || 0);
            const jual = Number(p.price || p.harga || 0);
            const stok = Number(p.stock || p.stok || 0);
            return [
                p.barcode || p.code || p.id || '-',
                p.name || p.nama || '-',
                p.category || p.kategori || 'Umum',
                p.unit || p.satuan || 'Pcs',
                fmtRp(modal),
                fmtRp(jual),
                stok.toLocaleString('id-ID'),
                fmtRp(modal * stok)
            ];
        });

        renderReportResultTable(cols, rows, [
            { label: 'Total SKU Barang', value: list.length.toLocaleString('id-ID') },
            { label: 'Total Fisik Stok', value: totalStock.toLocaleString('id-ID') },
            { label: 'Total Nilai Aset Modal', value: fmtRp(totalAsset) }
        ]);
    }
    else if (reportId === 'list_categories') {
        const list = MASTER_PRODUCTS_CACHE || [];
        const map = {};
        list.forEach(p => {
            const cat = p.category || p.kategori || 'Tanpa Kategori';
            if (!map[cat]) map[cat] = { count: 0, stock: 0, asset: 0 };
            map[cat].count += 1;
            map[cat].stock += Number(p.stock || p.stok || 0);
            map[cat].asset += Number(p.costPrice || p.modal || 0) * Number(p.stock || p.stok || 0);
        });
        const cols = ['Nama Kategori', 'Jumlah SKU', 'Total Stok Unit', 'Total Nilai Modal'];
        const rows = Object.keys(map).sort().map(k => [
            k,
            map[k].count.toLocaleString('id-ID'),
            map[k].stock.toLocaleString('id-ID'),
            fmtRp(map[k].asset)
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Kategori', value: rows.length }
        ]);
    }
    else if (reportId === 'list_customers') {
        const list = MEMBERS_CACHE || [];
        const cols = ['ID / Kode', 'Nama Pelanggan', 'No. HP / WA', 'Tier / Level', 'Total Belanja', 'Saldo Poin'];
        const rows = list.map(m => [
            m.id || m.memberId || '-',
            m.name || m.nama || '-',
            m.phone || m.hp || '-',
            m.tier || m.level || 'Reguler',
            fmtRp(m.totalSpent || m.totalBelanja || 0),
            (Number(m.points || m.poin || 0)).toLocaleString('id-ID')
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Pelanggan Terdaftar', value: list.length.toLocaleString('id-ID') }
        ]);
    }
    else if (reportId === 'list_suppliers') {
        const list = GUDANG_SUPPLIERS_CACHE || [];
        const cols = ['Kode', 'Nama Pemasok', 'Kontak / PIC', 'No. Telepon', 'Alamat'];
        const rows = list.map(s => [
            s.id || s.code || '-',
            s.name || s.nama || '-',
            s.contact || s.pic || '-',
            s.phone || s.telepon || '-',
            s.address || s.alamat || '-'
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Pemasok', value: list.length.toLocaleString('id-ID') }
        ]);
    }
    else if (reportId === 'list_users') {
        const list = (typeof USERS_CACHE !== 'undefined' && Array.isArray(USERS_CACHE)) ? USERS_CACHE : [];
        const cols = ['Username', 'Nama Lengkap', 'Role / Jabatan', 'Status'];
        const rows = list.map(u => [
            u.username || '-',
            u.name || u.nama || '-',
            u.role || '-',
            u.status || 'Aktif'
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Pengguna', value: list.length }
        ]);
    }
}

function buildSalesAndHybridReport(reportId, res, opts) {
    const fmtRp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
    const summary = res.summary || {};
    const transactions = Array.isArray(res.transactions) ? res.transactions : (Array.isArray(res.sales) ? res.sales : []);
    const daily = Array.isArray(res.daily) ? res.daily : [];
    const itemsSold = Array.isArray(res.items) ? res.items : extractItemsFromTransactions(transactions);

    if (reportId === 'sales_summary' || reportId === 'sales_chart') {
        const cols = ['Tanggal', 'Jumlah Transaksi', 'Omzet Kotor', 'Diskon', 'Omzet Bersih', 'HPP / Modal', 'Laba Kotor'];
        const rows = daily.map(d => {
            const gross = Number(d.gross || d.total || 0);
            const disc = Number(d.discount || 0);
            const net = Number(d.net || (gross - disc));
            const cost = Number(d.cost || d.hpp || 0);
            const profit = Number(d.profit || (net - cost));
            return [
                d.date || '-',
                (Number(d.count || d.trxCount || 0)).toLocaleString('id-ID'),
                fmtRp(gross),
                fmtRp(disc),
                fmtRp(net),
                fmtRp(cost),
                fmtRp(profit)
            ];
        });

        const totalNet = Number(summary.netSales || summary.totalSales || 0);
        const totalProfit = Number(summary.grossProfit || summary.profit || 0);
        const totalTrx = Number(summary.totalTransactions || transactions.length || 0);

        renderReportResultTable(cols, rows, [
            { label: 'Total Transaksi', value: totalTrx.toLocaleString('id-ID') },
            { label: 'Omzet Bersih', value: fmtRp(totalNet) },
            { label: 'Total Diskon', value: fmtRp(summary.totalDiscount || 0) },
            { label: 'Laba Kotor', value: fmtRp(totalProfit) }
        ]);

        if (reportId === 'sales_chart' && daily.length > 0) {
            renderReportBarChart(
                daily.map(d => d.date),
                [
                    { label: 'Omzet Bersih (Rp)', data: daily.map(d => Number(d.net || d.total || 0)), backgroundColor: '#2563eb' },
                    { label: 'Laba Kotor (Rp)', data: daily.map(d => Number(d.profit || 0)), backgroundColor: '#10b981' }
                ]
            );
        }
        return;
    }

    if (['sales_by_item', 'top_qty_items', 'top_freq_items', 'promo_items_out'].includes(reportId)) {
        let list = [...itemsSold];
        if (opts.extraFilter && opts.extraFilter !== 'ALL') {
            list = list.filter(i => (i.category || 'Umum') === opts.extraFilter);
        }
        if (reportId === 'promo_items_out') {
            list = list.filter(i => Number(i.discount || 0) > 0);
        }
        if (reportId === 'top_qty_items') list.sort((a, b) => b.qty - a.qty);
        else if (reportId === 'top_freq_items') list.sort((a, b) => b.freq - a.freq);
        else list.sort((a, b) => b.revenue - a.revenue);

        const cols = ['Peringkat', 'Kode', 'Nama Barang', 'Kategori', 'Frekuensi Struk', 'Qty Terjual', 'Diskon', 'Total Omzet', 'Laba Kotor'];
        const rows = list.map((it, i) => [
            `#${i + 1}`,
            it.code || '-',
            it.name || '-',
            it.category || 'Umum',
            it.freq.toLocaleString('id-ID') + 'x',
            it.qty.toLocaleString('id-ID'),
            fmtRp(it.discount),
            fmtRp(it.revenue),
            fmtRp(it.profit)
        ]);

        renderReportResultTable(cols, rows, [
            { label: 'Jumlah Jenis Barang', value: list.length.toLocaleString('id-ID') },
            { label: 'Total Unit Terjual', value: list.reduce((a, b) => a + b.qty, 0).toLocaleString('id-ID') },
            { label: 'Total Omzet Barang', value: fmtRp(list.reduce((a, b) => a + b.revenue, 0)) }
        ]);
        return;
    }

    if (reportId === 'unsold_items') {
        const soldNames = new Set(itemsSold.map(i => (i.name || '').toLowerCase()));
        const soldCodes = new Set(itemsSold.map(i => (i.code || '').toLowerCase()).filter(Boolean));
        let unsold = (MASTER_PRODUCTS_CACHE || []).filter(p => {
            const pName = (p.name || p.nama || '').toLowerCase();
            const pCode = (p.barcode || p.code || '').toLowerCase();
            return !soldNames.has(pName) && (!pCode || !soldCodes.has(pCode));
        });
        if (opts.extraFilter && opts.extraFilter !== 'ALL') {
            unsold = unsold.filter(p => (p.category || p.kategori) === opts.extraFilter);
        }

        const cols = ['Kode', 'Nama Barang', 'Kategori', 'Stok Tersedia', 'Harga Modal', 'Nilai Modal Tertahan'];
        const rows = unsold.map(p => {
            const stok = Number(p.stock || p.stok || 0);
            const modal = Number(p.costPrice || p.modal || 0);
            return [
                p.barcode || p.code || '-',
                p.name || p.nama || '-',
                p.category || p.kategori || 'Umum',
                stok.toLocaleString('id-ID'),
                fmtRp(modal),
                fmtRp(stok * modal)
            ];
        });

        renderReportResultTable(cols, rows, [
            { label: 'Barang Tidak Terjual', value: unsold.length.toLocaleString('id-ID') + ' SKU' },
            { label: 'Total Modal Tertahan', value: fmtRp(unsold.reduce((a, p) => a + (Number(p.stock || p.stok || 0) * Number(p.costPrice || p.modal || 0)), 0)) }
        ]);
        return;
    }

    if (reportId === 'sales_by_category') {
        const catMap = {};
        itemsSold.forEach(it => {
            const c = it.category || 'Umum';
            if (!catMap[c]) catMap[c] = { qty: 0, revenue: 0, profit: 0 };
            catMap[c].qty += it.qty;
            catMap[c].revenue += it.revenue;
            catMap[c].profit += it.profit;
        });
        const totalRev = Object.values(catMap).reduce((a, b) => a + b.revenue, 0) || 1;
        const cols = ['Kategori Barang', 'Qty Terjual', 'Total Omzet', 'Kontribusi (%)', 'Laba Kotor'];
        const rows = Object.keys(catMap).sort((a, b) => catMap[b].revenue - catMap[a].revenue).map(c => [
            c,
            catMap[c].qty.toLocaleString('id-ID'),
            fmtRp(catMap[c].revenue),
            ((catMap[c].revenue / totalRev) * 100).toFixed(1) + '%',
            fmtRp(catMap[c].profit)
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Kategori Terjual', value: rows.length },
            { label: 'Total Omzet', value: fmtRp(totalRev) }
        ]);
        return;
    }

    if (reportId === 'sales_by_cashier' || reportId === 'receipt_by_cashier') {
        const map = {};
        transactions.forEach(t => {
            const cashier = t.cashier || t.kasir || t.user || 'Kasir Utama';
            const pay = (t.paymentMethod || t.metodeBayar || 'Tunai').toUpperCase();
            const amt = Number(t.total || t.grandTotal || 0);
            if (!map[cashier]) map[cashier] = { count: 0, cash: 0, nonCash: 0, total: 0 };
            map[cashier].count += 1;
            map[cashier].total += amt;
            if (pay.includes('TUNAI') || pay.includes('CASH')) map[cashier].cash += amt;
            else map[cashier].nonCash += amt;
        });
        const cols = ['Nama Kasir', 'Jumlah Struk', 'Penerimaan Tunai', 'Penerimaan Non-Tunai', 'Total Penjualan'];
        const rows = Object.keys(map).map(k => [
            k,
            map[k].count.toLocaleString('id-ID'),
            fmtRp(map[k].cash),
            fmtRp(map[k].nonCash),
            fmtRp(map[k].total)
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Kasir Aktif', value: rows.length },
            { label: 'Total Penerimaan', value: fmtRp(Object.values(map).reduce((a, b) => a + b.total, 0)) }
        ]);
        return;
    }

    if (reportId === 'receipt_by_payment_type') {
        const map = {};
        transactions.forEach(t => {
            const pay = t.paymentMethod || t.metodeBayar || 'Tunai';
            const amt = Number(t.total || t.grandTotal || 0);
            if (!map[pay]) map[pay] = { count: 0, total: 0 };
            map[pay].count += 1;
            map[pay].total += amt;
        });
        const grand = Object.values(map).reduce((a, b) => a + b.total, 0) || 1;
        const cols = ['Metode / Tipe Pembayaran', 'Jumlah Transaksi', 'Total Nominal', 'Porsi (%)'];
        const rows = Object.keys(map).sort((a, b) => map[b].total - map[a].total).map(p => [
            p,
            map[p].count.toLocaleString('id-ID'),
            fmtRp(map[p].total),
            ((map[p].total / grand) * 100).toFixed(1) + '%'
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Metode Digunakan', value: rows.length },
            { label: 'Total Uang Masuk', value: fmtRp(grand) }
        ]);
        return;
    }

    if (reportId === 'sales_by_customer' || reportId === 'customer_visit_freq') {
        const map = {};
        transactions.forEach(t => {
            const cust = t.customerName || t.pelanggan || 'Pelanggan Umum';
            const amt = Number(t.total || t.grandTotal || 0);
            if (!map[cust]) map[cust] = { visits: 0, total: 0, lastDate: t.date || '-' };
            map[cust].visits += 1;
            map[cust].total += amt;
            if (t.date) map[cust].lastDate = t.date;
        });
        const keys = Object.keys(map).sort((a, b) => reportId === 'customer_visit_freq' ? map[b].visits - map[a].visits : map[b].total - map[a].total);
        const cols = ['Nama Pelanggan', 'Frekuensi Kunjungan', 'Total Belanja', 'Rata-rata per Struk', 'Kunjungan Terakhir'];
        const rows = keys.map(c => [
            c,
            map[c].visits.toLocaleString('id-ID') + 'x',
            fmtRp(map[c].total),
            fmtRp(map[c].total / (map[c].visits || 1)),
            map[c].lastDate
        ]);
        renderReportResultTable(cols, rows, [
            { label: 'Total Pelanggan Bertransaksi', value: rows.length }
        ]);
        return;
    }

    if (reportId === 'peak_hours_analysis') {
        const hours = Array.from({ length: 24 }, (_, h) => ({
            hour: `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`,
            count: 0,
            total: 0
        }));

        transactions.forEach(t => {
            const timeStr = t.time || t.jam || (t.date && t.date.includes(' ') ? t.date.split(' ')[1] : '12:00');
            const h = parseInt((timeStr || '12').split(':')[0], 10);
            if (!isNaN(h) && h >= 0 && h < 24) {
                hours[h].count += 1;
                hours[h].total += Number(t.total || t.grandTotal || 0);
            }
        });

        const busiest = [...hours].sort((a, b) => b.count - a.count)[0];
        const cols = ['Rentang Jam', 'Jumlah Transaksi', 'Total Omzet', 'Rata-rata Nilai Struk'];
        const rows = hours.filter(h => h.count > 0).map(h => [
            h.hour,
            h.count.toLocaleString('id-ID'),
            fmtRp(h.total),
            fmtRp(h.total / (h.count || 1))
        ]);

        renderReportResultTable(cols, rows, [
            { label: 'Jam Paling Ramai', value: busiest && busiest.count > 0 ? busiest.hour : '-' },
            { label: 'Transaksi di Jam Puncak', value: busiest ? busiest.count + ' struk' : '0' }
        ]);

        renderReportBarChart(
            hours.map(h => h.hour.slice(0, 5)),
            [{ label: 'Jumlah Transaksi per Jam', data: hours.map(h => h.count), backgroundColor: '#f59e0b' }]
        );
        return;
    }

    let filteredTrx = [...transactions];
    if (opts.extraFilter && opts.extraFilter !== 'ALL' && ACTIVE_REPORT_DEF.filterType === 'CASHIER') {
        filteredTrx = filteredTrx.filter(t => (t.cashier || t.kasir) === opts.extraFilter);
    }
    if (reportId === 'promo_discount_given') {
        filteredTrx = filteredTrx.filter(t => Number(t.discount || t.diskon || 0) > 0);
    }

    const cols = ['No. Faktur / Struk', 'Tanggal & Waktu', 'Kasir', 'Pelanggan', 'Metode Bayar', 'Diskon', 'Total Bayar'];
    const rows = filteredTrx.map(t => [
        t.invoice || t.id || t.noStruk || '-',
        `${t.date || '-'} ${t.time || ''}`.trim(),
        t.cashier || t.kasir || '-',
        t.customerName || t.pelanggan || 'Umum',
        t.paymentMethod || t.metodeBayar || 'Tunai',
        fmtRp(t.discount || t.diskon || 0),
        fmtRp(t.total || t.grandTotal || 0)
    ]);

    renderReportResultTable(cols, rows, [
        { label: 'Jumlah Transaksi', value: filteredTrx.length.toLocaleString('id-ID') },
        { label: 'Total Diskon Diberikan', value: fmtRp(filteredTrx.reduce((a, t) => a + Number(t.discount || t.diskon || 0), 0)) },
        { label: 'Total Nilai Transaksi', value: fmtRp(filteredTrx.reduce((a, t) => a + Number(t.total || t.grandTotal || 0), 0)) }
    ]);
}

function extractItemsFromTransactions(transactions) {
    const map = {};
    transactions.forEach(t => {
        const items = Array.isArray(t.items) ? t.items : [];
        items.forEach(it => {
            const key = it.code || it.name || 'Item';
            if (!map[key]) {
                map[key] = {
                    code: it.code || '-',
                    name: it.name || key,
                    category: it.category || 'Umum',
                    freq: 0,
                    qty: 0,
                    discount: 0,
                    revenue: 0,
                    profit: 0
                };
            }
            const q = Number(it.qty || 1);
            const price = Number(it.price || 0);
            const cost = Number(it.costPrice || it.modal || 0);
            const disc = Number(it.discount || 0);
            const rev = Number(it.subtotal || (price * q - disc));

            map[key].freq += 1;
            map[key].qty += q;
            map[key].discount += disc;
            map[key].revenue += rev;
            map[key].profit += (rev - (cost * q));
        });
    });
    return Object.values(map);
}

function renderReportResultTable(columns, rows, kpis = []) {
    CURRENT_REPORT_COLUMNS = columns;
    CURRENT_REPORT_ROWS = rows;

    const kpiBox = document.getElementById('rv-kpi-container');
    kpiBox.innerHTML = kpis.map(k => `
        <div class="card" style="padding:14px 16px; border-left:4px solid var(--primary);">
            <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">${k.label}</div>
            <div style="font-size:18px; font-weight:800; color:#0f172a; margin-top:4px;">${k.value}</div>
        </div>
    `).join('');

    const thead = document.getElementById('rv-table-head');
    const tbody = document.getElementById('rv-table-body');

    thead.innerHTML = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center; padding:36px; color:#94a3b8;">Tidak ada data untuk periode atau filter yang dipilih.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>${row.map((cell, idx) => `<td style="${idx === 0 ? 'font-weight:600;' : ''}">${cell}</td>`).join('')}</tr>
    `).join('');
}

function renderReportBarChart(labels, datasets) {
    const chartBox = document.getElementById('rv-chart-container');
    const canvas = document.getElementById('rv-canvas-chart');
    if (!chartBox || !canvas || typeof Chart === 'undefined') return;

    chartBox.style.display = 'block';
    if (REPORT_CHART_INSTANCE) {
        REPORT_CHART_INSTANCE.destroy();
    }

    REPORT_CHART_INSTANCE = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function filterReportTableRows(keyword) {
    const q = (keyword || '').toLowerCase().trim();
    const tbody = document.getElementById('rv-table-body');
    if (!tbody) return;

    const filtered = !q
        ? CURRENT_REPORT_ROWS
        : CURRENT_REPORT_ROWS.filter(row => row.some(cell => String(cell).toLowerCase().includes(q)));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${CURRENT_REPORT_COLUMNS.length || 1}" style="text-align:center; padding:28px; color:#94a3b8;">Tidak ada baris yang cocok dengan "${keyword}".</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(row => `
        <tr>${row.map((cell, idx) => `<td style="${idx === 0 ? 'font-weight:600;' : ''}">${cell}</td>`).join('')}</tr>
    `).join('');
}

function exportActiveReportCSV() {
    if (!ACTIVE_REPORT_DEF || !CURRENT_REPORT_ROWS.length) {
        alert('Tidak ada data laporan untuk diekspor.');
        return;
    }

    const escapeCSV = val => `"${String(val).replace(/"/g, '""')}"`;
    const csvLines = [
        CURRENT_REPORT_COLUMNS.map(escapeCSV).join(','),
        ...CURRENT_REPORT_ROWS.map(r => r.map(escapeCSV).join(','))
    ];

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Laporan_${ACTIVE_REPORT_DEF.id}_${dateTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function printActiveReport() {
    if (!ACTIVE_REPORT_DEF) return;

    const storeName = (document.getElementById('sidebar-store-name')?.textContent || 'DANISH POS').trim();
    const startDate = document.getElementById('rv-start-date').value;
    const endDate = document.getElementById('rv-end-date').value;

    document.getElementById('print-rep-store').textContent = storeName;
    document.getElementById('print-rep-title').textContent = document.getElementById('rv-title').textContent;
    document.getElementById('print-rep-period').textContent = ACTIVE_REPORT_DEF.needsDate
        ? `Periode: ${startDate} s/d ${endDate}`
        : `Dicetak pada: ${new Date().toLocaleString('id-ID')}`;

    const printContent = document.getElementById('printable-report-area').innerHTML;
    const win = window.open('', '_blank', 'width=960,height=720');
    win.document.write(`
        <html>
        <head>
            <title>${document.getElementById('rv-title').textContent}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
                .print-only-header { display: block !important; margin-bottom: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; }
                th { background: #f1f5f9; font-weight: bold; }
            </style>
        </head>
        <body>${printContent}</body>
        </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
}

function getSavedReportPresets() {
    try {
        return JSON.parse(localStorage.getItem('danish_pos_saved_reports') || '[]');
    } catch (e) {
        return [];
    }
}

function saveCurrentReportPreset() {
    if (!ACTIVE_REPORT_DEF) return;
    const defaultName = `${ACTIVE_REPORT_DEF.title} (${new Date().toLocaleDateString('id-ID')})`;
    const customName = prompt('Beri nama untuk laporan tersimpan ini:', defaultName);
    if (!customName) return;

    const presets = getSavedReportPresets();
    presets.unshift({
        reportId: ACTIVE_REPORT_DEF.id,
        baseTitle: ACTIVE_REPORT_DEF.title,
        customName: customName.trim(),
        startDate: document.getElementById('rv-start-date').value,
        endDate: document.getElementById('rv-end-date').value,
        extraFilter: document.getElementById('rv-filter-select').value
    });

    localStorage.setItem('danish_pos_saved_reports', JSON.stringify(presets));
    renderReportCategorySidebar();
    alert('✅ Laporan berhasil disimpan ke kategori "Laporan Tersimpan"!');
}

function openSavedPreset(index) {
    const presets = getSavedReportPresets();
    const p = presets[index];
    if (!p) return;
    openReportViewer(p.reportId, p);
}

function deleteSavedPreset(index) {
    if (!confirm('Hapus laporan tersimpan ini?')) return;
    const presets = getSavedReportPresets();
    presets.splice(index, 1);
    localStorage.setItem('danish_pos_saved_reports', JSON.stringify(presets));
    renderReportCategorySidebar();
    renderSavedReportsGrid();
}