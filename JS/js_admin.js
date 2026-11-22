// JS/js_admin.js - Logika Backoffice & Admin SIS v3.1 (RENE POS Edition Lengkap)
if (SESSION) {
  document.getElementById('storeTitle').textContent = `${SESSION.store.namaToko} (${SESSION.store.kodeToko})`;
  document.getElementById('userBadge').textContent = `${SESSION.user.nama} [${SESSION.user.role}]`;
}

async function callAdminApi(endpoint, payload, onSuccess) {
  try {
    const data = await ApiClient.call(endpoint, payload || {});
    onSuccess(data);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  btn.classList.add('active');

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

    const auditBody = document.getElementById('auditTableBody');
    auditBody.innerHTML = data.recentLogs.map(l => `
      <tr>
        <td>${l.waktu}</td><td>${l.toko}</td><td>${l.user}</td>
        <td><span class="badge ${l.aktivitas.includes('FAIL') || l.aktivitas.includes('BLOCK') || l.aktivitas.includes('FRAUD') ? 'badge-danger' : 'badge-ok'}">${l.aktivitas}</span></td>
        <td>${l.keterangan}</td>
      </tr>
    `).join('');

    const tagBody = document.getElementById('priceTagBody');
    tagBody.innerHTML = data.pendingPriceTags.map(t => `
      <tr><td>${t.sku} - ${t.nama}</td><td><strong>Rp ${Number(t.hargaBaru).toLocaleString('id-ID')}</strong></td></tr>
    `).join('') || '<tr><td colspan="2">Semua label harga sudah terbaru.</td></tr>';
  });
}

// === MASTER BARANG & PROMO ===
function loadMasterCatalog() {
  callAdminApi('admin/products', {}, items => {
    const tbody = document.getElementById('masterCatalogBody');
    tbody.innerHTML = items.map(p => `
      <tr>
        <td><strong>${p.sku}</strong></td>
        <td>${p.barcode}</td>
        <td>${p.nama}</td>
        <td>${p.kategori}</td>
        <td>${p.satuan}</td>
        <td>${p.hargaModal !== null ? 'Rp ' + p.hargaModal.toLocaleString('id-ID') : '<span style="color:#94A3B8;">Hidden</span>'}</td>
        <td><strong>Rp ${p.hargaJual.toLocaleString('id-ID')}</strong></td>
        <td>
          <button class="btn btn-blue btn-sm" onclick='fillProductForm(${JSON.stringify(p)})'>Edit</button>
        </td>
      </tr>
    `).join('');
  });
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
  });
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
  });
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
  });
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
  });
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
  });
}

// === SUPPLIER, PEMBELIAN LPB & HUTANG USAHA (RENE POS TAHAP 3) ===
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
  });
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
  });
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
  });
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
  });
}

// === LAPORAN PENJUALAN & LABA RUGI (X/Z-REPORT) ===
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
  });
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
  });
}

// === BLIND STOCK OPNAME ===
function loadBlindSOItems() {
  callAdminApi('inventory/stok-toko', { blindMode: true }, items => {
    const tbody = document.getElementById('soTableBody');
    tbody.innerHTML = items.map(item => `
      <tr>
        <td><strong>${item.sku}</strong></td>
        <td>${item.barcode}</td>
        <td>${item.nama}</td>
        <td>${item.satuan}</td>
        <td><input type="number" class="so-input" data-sku="${item.sku}" placeholder="0" style="width:110px;"></td>
      </tr>
    `).join('');
  });
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
  });
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
  });
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
  });
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
  });
}

function bindUserDevice(targetUserId, currentDev) {
  const newDev = prompt(`Masukkan Device ID baru untuk ${targetUserId}\n(Kosongkan atau ketik ANY untuk bebas perangkat):`, currentDev);
  if (newDev === null) return;
  callAdminApi('security/device-binding', { targetUserId, newDeviceId: newDev }, () => {
    alert('Device binding berhasil diperbarui.');
    loadUsersTable();
  });
}

function resetUserDevice(targetUserId) {
  if (!confirm(`Lepas kunci perangkat (UNBOUND) untuk user ${targetUserId}?`)) return;
  callAdminApi('security/device-binding', { targetUserId, newDeviceId: 'UNBOUND' }, () => {
    alert('Perangkat user berhasil di-reset ke UNBOUND.');
    loadUsersTable();
  });
}

function goKasir() {
  window.location.href = 'kasir.html';
}

function logout() {
  localStorage.removeItem('POS_SESSION');
  window.location.href = 'login.html';
}

loadDashboard();