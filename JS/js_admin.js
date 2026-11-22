// JS/js_admin.js - Logika Backoffice & Admin SIS v3.1
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