let CART = [];
let SELECTED_INDEX = -1;
let ACTIVE_PROMOS = [];
let ACTIVE_MEMBER = {
  member_id: 'MBR-000',
  card_code: 'UMUM',
  name: 'Pelanggan Umum',
  phone: '-',
  price_level: 'UMUM',
  member_discount_pct: 0,
  points: 0,
  credit_limit: 0,
  current_debt: 0
};
let LAST_RECEIPT_HTML = '';
let LAST_REPRINT_COUNT = 0;
let ACTIVE_SHIFT = JSON.parse(localStorage.getItem('POS_ACTIVE_SHIFT') || 'null');
let RETURN_TARGET_TRX = null;

// Saluran Layar Pelanggan Tanpa Internet (0ms)
const customerChannel = new BroadcastChannel('POS_CUSTOMER_DISPLAY');

// Inisialisasi Awal Kasir
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hdrStoreName').textContent = `${SESSION.store.namaToko} (${SESSION.store.kodeToko})`;
  document.getElementById('hdrCashierInfo').textContent = `Kasir: ${SESSION.user.nama}`;

  // Jam Real-time Header
  setInterval(() => {
    document.getElementById('hdrClock').textContent = new Date().toLocaleTimeString('id-ID');
  }, 1000);

  // Pastikan Shift Kasir sudah dibuka
  if (!ACTIVE_SHIFT || ACTIVE_SHIFT.cashierId !== SESSION.user.userId) {
    await promptOpenShift();
  } else {
    document.getElementById('hdrShiftId').textContent = `Shift: ${ACTIVE_SHIFT.shiftId}`;
  }

  // Muat promo lokal dari IndexedDB & sinkronkan master terbaru
  ACTIVE_PROMOS = await LocalDB.getActivePromotions();
  if ((await db.products.count()) === 0) {
    await syncMasterNow();
  }
  focusScanner();
});

async function promptOpenShift() {
  const modalStr = prompt(`Buka Shift Kasir (${SESSION.user.nama})\nMasukkan Nominal Modal Awal / Petty Cash di laci (Rp):`, '200000');
  if (modalStr === null) return;
  try {
    const shiftData = await ApiClient.call('pos/open-shift', { modalAwal: Number(modalStr) || 0 });
    ACTIVE_SHIFT = shiftData;
    localStorage.setItem('POS_ACTIVE_SHIFT', JSON.stringify(ACTIVE_SHIFT));
    document.getElementById('hdrShiftId').textContent = `Shift: ${ACTIVE_SHIFT.shiftId}`;
  } catch (e) {
    alert('Gagal membuka shift: ' + e.message);
  }
}

async function syncMasterNow() {
  try {
    const data = await ApiClient.call('pos/sync-master', {});
    await LocalDB.saveMasterData(data.products, data.promotions, data.members || []);
    ACTIVE_PROMOS = await LocalDB.getActivePromotions();
    alert(`Sinkronisasi selesai: ${data.products.length} SKU, ${data.promotions.length} Promo, & ${(data.members || []).length} Member.`);
  } catch (e) {
    alert('Gagal sinkron master: ' + e.message);
  }
}

function focusScanner() {
  const inp = document.getElementById('barcodeInput');
  if (inp) inp.focus();
}

// Pemindaian Barcode Instan (< 50ms dari IndexedDB)
document.getElementById('barcodeInput').addEventListener('keydown', async function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const rawCode = this.value.trim();
    this.value = '';
    if (!rawCode) return;

    // Mendukung format qty*barcode (misal: 3*899999900101)
    let qty = 1;
    let barcode = rawCode;
    if (rawCode.includes('*')) {
      const parts = rawCode.split('*');
      qty = Math.max(1, parseInt(parts[0], 10) || 1);
      barcode = parts[1].trim();
    }

    const product = await LocalDB.findByBarcode(barcode);
    if (!product) {
      alert(`Barcode '${barcode}' tidak ditemukan di katalog lokal!`);
      return;
    }
    addToCart(product, qty);
  }
});

function addToCart(product, qty = 1) {
  const existingIdx = CART.findIndex(item => item.barcode === product.barcode);
  if (existingIdx !== -1) {
    CART[existingIdx].qty += qty;
    SELECTED_INDEX = existingIdx;
  } else {
    CART.push({
      barcode: product.barcode,
      sku_code: product.sku_code,
      name: product.name,
      unit: product.unit || 'PCS',
      conversion_qty: product.conversion_qty || 1,
      price: product.price,
      cost_price: product.cost_price || 0,
      is_non_physical: product.is_non_physical || false,
      manual_discount: 0,
      qty: qty
    });
    SELECTED_INDEX = CART.length - 1;
  }
  renderCart();
}

function evaluateCartWithMember() {
  const evalResult = PromoEngine.evaluateCart(CART, ACTIVE_PROMOS);

  // Pertahankan diskon manual per item jika diberikan supervisor via [F4]
  let manualExtra = 0;
  CART.forEach(item => {
    if ((item.manual_discount || 0) > (item.discount || 0)) {
      const diff = item.manual_discount - (item.discount || 0);
      item.discount = item.manual_discount;
      manualExtra += diff;
    }
  });

  const afterItemDisc = Math.max(0, evalResult.grandTotal - manualExtra);
  const memberPct = Number(ACTIVE_MEMBER.member_discount_pct) || 0;
  let memberDiscountExtra = 0;
  if (memberPct > 0 && afterItemDisc > 0) {
    memberDiscountExtra = Math.round(afterItemDisc * (memberPct / 100));
  }

  return {
    ...evalResult,
    memberDiscount: memberDiscountExtra,
    totalDiscount: evalResult.totalDiscount + manualExtra + memberDiscountExtra,
    grandTotal: Math.max(0, afterItemDisc - memberDiscountExtra)
  };
}

function renderCart() {
  const evalResult = evaluateCartWithMember();
  const tbody = document.getElementById('cartTableBody');

  tbody.innerHTML = CART.map((item, idx) => {
    const lineTotal = (item.price * item.qty) - (item.discount || 0);
    const unitBadge = `<span style="background:#E2E8F0;color:#334155;font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px;margin-left:4px;">${item.unit || 'PCS'}</span>`;
    return `
      <tr class="cart-row ${idx === SELECTED_INDEX ? 'selected' : ''}" onclick="SELECTED_INDEX=${idx}; renderCart();">
        <td>${idx + 1}</td>
        <td>
          <strong>${item.name}</strong>${unitBadge}<br>
          <small style="color:var(--text-muted);">${item.barcode} ${item.promoLabel ? '• <span style="color:#7C3AED;font-weight:700;">' + item.promoLabel + '</span>' : ''}</small>
        </td>
        <td class="num">${item.price.toLocaleString('id-ID')}</td>
        <td class="num"><strong>${item.qty}</strong> ${item.unit || 'PCS'}</td>
        <td class="num" style="color:#DC2626;">${(item.discount || 0) > 0 ? '-' + item.discount.toLocaleString('id-ID') : '0'}</td>
        <td class="num"><strong>${lineTotal.toLocaleString('id-ID')}</strong></td>
      </tr>
    `;
  }).join('');

  document.getElementById('lblSubtotal').textContent = 'Rp ' + evalResult.subtotal.toLocaleString('id-ID');
  document.getElementById('lblDiscount').textContent = 'Rp ' + evalResult.totalDiscount.toLocaleString('id-ID');
  document.getElementById('lblGrandTotal').textContent = 'Rp ' + evalResult.grandTotal.toLocaleString('id-ID');

  // Notifikasi PWP (Tebus Murah)
  const pwpBox = document.getElementById('pwpAlertBox');
  if (evalResult.pwpOffers.length > 0) {
    pwpBox.style.display = 'block';
    pwpBox.textContent = `PROMO PWP AKTIF! Pelanggan berhak tebus murah barcode: ${evalResult.pwpOffers[0].reward_barcode} seharga Rp ${evalResult.pwpOffers[0].promo_price.toLocaleString('id-ID')}`;
  } else {
    pwpBox.style.display = 'none';
  }

  // Kirim pembaruan real-time ke Layar Pelanggan (display.html)
  customerChannel.postMessage({
    type: CART.length > 0 ? 'CART_UPDATE' : 'IDLE',
    storeName: SESSION.store.namaToko,
    items: CART,
    summary: evalResult
  });
}

// === MODUL MEMBER & CRM (RENE POS) [F1] ===
function openMemberModal() {
  document.getElementById('memberModal').style.display = 'flex';
  document.getElementById('memberSearchInput').value = '';
  document.getElementById('memberSearchInput').focus();
  runMemberSearch();
}

async function runMemberSearch() {
  const kw = document.getElementById('memberSearchInput').value;
  const list = await LocalDB.searchMembers(kw);
  document.getElementById('memberResultBody').innerHTML = list.map(m => `
    <tr style="cursor:pointer;" onclick='selectActiveMember(${JSON.stringify(m)})'>
      <td><strong>${m.card_code}</strong></td>
      <td>${m.name}<br><small style="color:#64748B;">${m.phone}</small></td>
      <td><span style="background:#EFF6FF;color:#1D4ED8;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:700;">${m.price_level}</span></td>
      <td class="num"><strong>${m.points}</strong> pt</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;">Member tidak ditemukan.</td></tr>';
}

function selectActiveMember(member) {
  ACTIVE_MEMBER = member;
  document.getElementById('lblActiveMemberName').textContent = `${member.name} (${member.price_level}${member.member_discount_pct > 0 ? ' -' + member.member_discount_pct + '%' : ''})`;
  document.getElementById('lblActiveMemberBadge').textContent = `${member.points} Poin`;
  document.getElementById('btnResetMember').style.display = member.member_id !== 'MBR-000' ? 'inline-block' : 'none';
  closeModals();
  renderCart();
}

function resetActiveMember() {
  selectActiveMember({
    member_id: 'MBR-000',
    card_code: 'UMUM',
    name: 'Pelanggan Umum',
    phone: '-',
    price_level: 'UMUM',
    member_discount_pct: 0,
    points: 0,
    credit_limit: 0,
    current_debt: 0
  });
}

async function quickRegisterMember() {
  const nama = document.getElementById('newMbrName').value.trim();
  const phone = document.getElementById('newMbrPhone').value.trim();
  const level = document.getElementById('newMbrLevel').value;
  const discountPct = level === 'GOLD' ? 5 : (level === 'SILVER' ? 2 : 0);

  if (!nama || !phone) return alert('Nama dan No. HP pelanggan wajib diisi.');

  try {
    const res = await ApiClient.call('member/save', { nama, phone, priceLevel: level, discountPct });
    if (res.member) {
      await LocalDB.upsertMember(res.member);
      selectActiveMember(res.member);
      alert(res.message);
    }
  } catch (e) {
    alert('Gagal mendaftarkan member: ' + e.message);
  }
}

// === UBAH QTY & DISKON PER BARIS [F4] ===
function openEditItemModal() {
  if (CART.length === 0 || SELECTED_INDEX < 0) return alert('Pilih baris barang di tabel belanja terlebih dahulu.');
  const item = CART[SELECTED_INDEX];
  document.getElementById('editItemTitle').textContent = `${item.name} (Rp ${item.price.toLocaleString('id-ID')})`;
  document.getElementById('editItemQty').value = item.qty;
  document.getElementById('editItemDiscPct').value = 0;
  document.getElementById('editItemDiscRp').value = item.manual_discount || 0;
  document.getElementById('editItemPin').value = '';
  document.getElementById('editItemModal').style.display = 'flex';
  document.getElementById('editItemQty').focus();
  document.getElementById('editItemQty').select();
}

async function applyEditItem() {
  if (SELECTED_INDEX < 0 || !CART[SELECTED_INDEX]) return;
  const item = CART[SELECTED_INDEX];
  const newQty = Math.max(1, parseInt(document.getElementById('editItemQty').value, 10) || 1);
  const discPct = Math.max(0, Math.min(100, Number(document.getElementById('editItemDiscPct').value) || 0));
  const discRp = Math.max(0, Number(document.getElementById('editItemDiscRp').value) || 0);
  const pin = document.getElementById('editItemPin').value;

  const lineGross = item.price * newQty;
  const calcDisc = Math.round(lineGross * (discPct / 100)) + discRp;

  if (calcDisc > 0) {
    if (!pin) return alert('PIN Supervisor wajib diisi untuk memberikan diskon manual per item.');
    try {
      await ApiClient.call('auth/verify-pin', { pin });
    } catch (e) {
      return alert('PIN Supervisor ditolak: ' + e.message);
    }
  }

  item.qty = newQty;
  item.manual_discount = calcDisc;
  item.discount = calcDisc;
  if (calcDisc > 0) item.promoLabel = `Disc Manual Rp ${calcDisc.toLocaleString('id-ID')}`;

  closeModals();
  renderCart();
}

// Void Item Terpilih (Wajib PIN Supervisor)
async function voidSelectedItem() {
  if (CART.length === 0 || SELECTED_INDEX < 0) return;
  const pin = prompt('OTORISASI VOID ITEM\nMasukkan PIN Kepala Toko / Supervisor:');
  if (!pin) return;

  try {
    const auth = await ApiClient.call('auth/verify-pin', { pin });
    const removed = CART.splice(SELECTED_INDEX, 1)[0];
    SELECTED_INDEX = CART.length - 1;
    renderCart();

    await db.audit_logs.add({
      timestamp: new Date().toISOString(),
      user_id: SESSION.user.userId,
      supervisor_id: auth.supervisor.idUser,
      action_type: 'VOID_ITEM',
      detail: `Hapus item ${removed.name} (${removed.qty}x)`,
      sync_status: 'PENDING'
    });
  } catch (e) {
    alert('Otorisasi Ditolak: ' + e.message);
  }
  focusScanner();
}

// Pending / Recall Struk [F6]
async function handleHoldRecall() {
  if (CART.length > 0) {
    const note = prompt('Simpan Transaksi Sementara (Hold)\nCatatan nama/ciri pembeli:', 'Antrean 1');
    if (note === null) return;
    await db.held_carts.put({
      hold_id: 'HOLD-' + Date.now(),
      timestamp: new Date().toISOString(),
      customer_note: note,
      items_json: JSON.stringify(CART)
    });
    CART = [];
    SELECTED_INDEX = -1;
    renderCart();
    alert('Keranjang berhasil disimpan sementara.');
  } else {
    const holds = await db.held_carts.toArray();
    if (holds.length === 0) return alert('Tidak ada transaksi tertunda (Hold).');
    const latest = holds[holds.length - 1];
    CART = JSON.parse(latest.items_json);
    await db.held_carts.delete(latest.hold_id);
    SELECTED_INDEX = CART.length - 1;
    renderCart();
  }
  focusScanner();
}

// Pembayaran Lengkap RENE POS [F8 / F10]
function openCheckoutModal(defaultMode) {
  if (CART.length === 0) return;
  const evalResult = evaluateCartWithMember();

  document.getElementById('checkoutMemberTag').textContent = `${ACTIVE_MEMBER.name} (${ACTIVE_MEMBER.points} Poin)`;
  document.getElementById('payInvoiceDiscount').value = 0;

  // Kontrol Tukar Poin Member
  const redeemInp = document.getElementById('payRedeemPoints');
  document.getElementById('availPointsLbl').textContent = ACTIVE_MEMBER.points;
  redeemInp.value = 0;
  redeemInp.max = ACTIVE_MEMBER.points;
  redeemInp.disabled = ACTIVE_MEMBER.member_id === 'MBR-000' || ACTIVE_MEMBER.points <= 0;

  // Kontrol Kredit / Tempo Member
  const sisaLimit = Math.max(0, (ACTIVE_MEMBER.credit_limit || 0) - (ACTIVE_MEMBER.current_debt || 0));
  const tempoRow = document.getElementById('tempoPaymentRow');
  document.getElementById('availCreditLbl').textContent = 'Rp ' + sisaLimit.toLocaleString('id-ID');
  document.getElementById('payTempoInput').value = 0;
  tempoRow.style.display = (ACTIVE_MEMBER.member_id !== 'MBR-000' && sisaLimit > 0) ? 'block' : 'none';

  const initialDue = (document.getElementById('payAutoRound') && document.getElementById('payAutoRound').checked)
    ? Math.floor(evalResult.grandTotal / 100) * 100
    : evalResult.grandTotal;

  document.getElementById('payCashInput').value = defaultMode === 'CASH' ? initialDue : 0;
  document.getElementById('payQrisInput').value = defaultMode === 'QRIS' ? initialDue : 0;
  document.getElementById('payEdcInput').value = 0;
  document.getElementById('payEdcRef').value = '';

  calcChange();
  document.getElementById('checkoutModal').style.display = 'flex';

  if (defaultMode === 'QRIS') {
    customerChannel.postMessage({ type: 'SHOW_QRIS', amount: initialDue });
    document.getElementById('payQrisInput').focus();
  } else {
    document.getElementById('payCashInput').focus();
    document.getElementById('payCashInput').select();
  }
}

function getCheckoutComputation() {
  const evalResult = evaluateCartWithMember();
  const invoiceDisc = Math.max(0, Number(document.getElementById('payInvoiceDiscount').value) || 0);
  const maxPts = ACTIVE_MEMBER.points || 0;
  const redeemPts = Math.min(maxPts, Math.max(0, Number(document.getElementById('payRedeemPoints').value) || 0));
  const redeemValue = redeemPts * 100; // 1 Poin = Rp 100

  let netBeforeTax = Math.max(0, evalResult.grandTotal - invoiceDisc - redeemValue);
  const includePpn = document.getElementById('payIncludePpn') && document.getElementById('payIncludePpn').checked;
  const ppnAmount = includePpn ? Math.round(netBeforeTax * 0.11) : 0;

  let netDue = netBeforeTax + ppnAmount;
  const autoRound = document.getElementById('payAutoRound') && document.getElementById('payAutoRound').checked;
  if (autoRound && netDue > 0) {
    netDue = Math.floor(netDue / 100) * 100;
  }

  const cash = Number(document.getElementById('payCashInput').value) || 0;
  const qris = Number(document.getElementById('payQrisInput').value) || 0;
  const edc = Number(document.getElementById('payEdcInput').value) || 0;
  const tempo = Number(document.getElementById('payTempoInput').value) || 0;

  const totalPaid = cash + qris + edc + tempo;
  const change = totalPaid - netDue;

  return {
    evalResult, invoiceDisc, redeemPts, redeemValue, ppnAmount, netDue,
    cash, qris, edc, tempo, totalPaid, change
  };
}

function calcChange() {
  const comp = getCheckoutComputation();
  document.getElementById('modalTotalDue').textContent = 'Rp ' + comp.netDue.toLocaleString('id-ID');
  document.getElementById('modalChangeVal').textContent = 'Rp ' + Math.max(0, comp.change).toLocaleString('id-ID');
}

async function processFinalPayment() {
  const comp = getCheckoutComputation();
  const edcRef = document.getElementById('payEdcRef').value.trim();

  if (comp.totalPaid < comp.netDue) {
    return alert('Nominal pembayaran kurang dari Tagihan Akhir!');
  }
  if (comp.edc > 0 && !edcRef) {
    return alert('Nomor Approval / Referensi EDC wajib diisi untuk pembayaran kartu!');
  }
  const sisaLimit = Math.max(0, (ACTIVE_MEMBER.credit_limit || 0) - (ACTIVE_MEMBER.current_debt || 0));
  if (comp.tempo > sisaLimit) {
    return alert(`Nominal Tempo melebihi sisa limit piutang member (Rp ${sisaLimit.toLocaleString('id-ID')})!`);
  }

  const payments = [];
  const cashNet = comp.cash > 0 ? Math.max(0, comp.cash - Math.max(0, comp.change)) : 0;
  if (cashNet > 0) payments.push({ method: 'CASH', amount: cashNet });
  if (comp.qris > 0) payments.push({ method: 'QRIS', amount: comp.qris });
  if (comp.edc > 0) payments.push({ method: 'EDC', amount: comp.edc, ref: edcRef });
  if (comp.tempo > 0) payments.push({ method: 'TEMPO', amount: comp.tempo });
  if (comp.redeemValue > 0) payments.push({ method: 'POINTS_REDEEM', amount: comp.redeemValue, points: comp.redeemPts });

  const isPurePpob = CART.every(it => it.is_non_physical === true);
  const trxType = isPurePpob ? 'PPOB' : 'SALE';
  const totalAllDiscount = comp.evalResult.totalDiscount + comp.invoiceDisc + comp.redeemValue;

  const trxId = `TRX-${SESSION.store.kodeToko}-${Date.now()}`;
  const shiftId = ACTIVE_SHIFT ? ACTIVE_SHIFT.shiftId : 'SHF-OFFLINE';
  const itemsJson = JSON.stringify(CART);

  // Hitung SHA-256 Checksum lokal untuk anti-tampering
  const checksum = await SecurityModule.sha256(`${trxId}|${shiftId}|${comp.netDue}|${itemsJson}`);

  const trxRecord = {
    trx_id: trxId,
    shift_id: shiftId,
    timestamp: new Date().toISOString(),
    cashier_id: SESSION.user.userId,
    member_id: ACTIVE_MEMBER.member_id,
    points_redeemed: comp.redeemPts,
    items_json: itemsJson,
    promo_applied_json: JSON.stringify(comp.evalResult.appliedPromos),
    subtotal: comp.evalResult.subtotal,
    discount_total: totalAllDiscount,
    tax_amount: comp.ppnAmount,
    grand_total: comp.netDue,
    payments_json: JSON.stringify(payments),
    trx_type: trxType,
    sync_status: 'PENDING',
    checksum: checksum
  };

  await LocalDB.saveTransaction(trxRecord);

  // Update poin lokal member secara langsung agar akurat untuk transaksi berikutnya
  if (ACTIVE_MEMBER.member_id !== 'MBR-000') {
    const earnedPts = Math.floor(comp.netDue / 10000);
    ACTIVE_MEMBER.points = Math.max(0, ACTIVE_MEMBER.points - comp.redeemPts + earnedPts);
    ACTIVE_MEMBER.current_debt = (ACTIVE_MEMBER.current_debt || 0) + comp.tempo;
    await LocalDB.upsertMember(ACTIVE_MEMBER);
  }

  printThermalReceipt(trxRecord, CART, comp, false);

  // Reset keranjang & kirim sinyal kembalian ke layar pelanggan
  customerChannel.postMessage({ type: 'PAYMENT_DONE', grandTotal: comp.netDue, change: Math.max(0, comp.change) });
  CART = [];
  SELECTED_INDEX = -1;
  resetActiveMember();
  closeModals();
  renderCart();
  ApiClient.syncQueue(); // Trigger background sync
}

function printThermalReceipt(trx, items, comp, isCopy) {
  const paperClass = SESSION.store.ukuranKertas === '58mm' ? 'paper-58' : 'paper-80';
  const copyBanner = isCopy ? '<div style="text-align:center;font-weight:bold;border:1px dashed #000;margin:4px 0;">*** COPY STRUK ***</div>' : '';

  const html = `
    <div class="receipt ${paperClass}">
      <div style="text-align:center;">
        <strong>${SESSION.store.namaToko}</strong><br>
        <small>${SESSION.store.alamat || ''}</small>
      </div>
      ${copyBanner}
      <hr>
      <small>No: ${trx.trx_id}<br>Kasir: ${SESSION.user.nama} | ${new Date(trx.timestamp).toLocaleString('id-ID')}<br>Member: ${ACTIVE_MEMBER.name}</small>
      <hr>
      ${items.map(i => `
        <div>${i.name}</div>
        <div style="display:flex;justify-content:space-between;">
          <span>${i.qty} ${i.unit || ''} x ${i.price.toLocaleString('id-ID')}</span>
          <span>${((i.price * i.qty) - (i.discount || 0)).toLocaleString('id-ID')}</span>
        </div>
      `).join('')}
      <hr>
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${trx.subtotal.toLocaleString('id-ID')}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Total Diskon/Poin</span><span>-${trx.discount_total.toLocaleString('id-ID')}</span></div>
      ${comp.ppnAmount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>PPN (11%)</span><span>${comp.ppnAmount.toLocaleString('id-ID')}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>TOTAL</span><span>Rp ${trx.grand_total.toLocaleString('id-ID')}</span></div>
      ${comp.cash > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Tunai</span><span>${comp.cash.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.qris > 0 ? `<div style="display:flex;justify-content:space-between;"><span>QRIS/Transfer</span><span>${comp.qris.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.edc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>EDC</span><span>${comp.edc.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.tempo > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Kredit/Tempo</span><span>${comp.tempo.toLocaleString('id-ID')}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;"><span>Kembali</span><span>${Math.max(0, comp.change).toLocaleString('id-ID')}</span></div>
      <hr>
      <div style="text-align:center;"><small>Terima Kasih Atas Kunjungan Anda</small></div>
    </div>
  `;
  LAST_RECEIPT_HTML = html.replace('</small>\n      </div>', `</small>\n      </div><div style="text-align:center;font-weight:bold;border:1px dashed #000;margin:4px 0;">*** COPY STRUK ***</div>`);
  LAST_REPRINT_COUNT = 0;

  document.getElementById('thermalReceiptArea').innerHTML = html;
  window.print();
}

// Kontrol Cetak Ulang Maksimal 1x dengan Label Wajib COPY STRUK
function reprintLastReceipt() {
  if (!LAST_RECEIPT_HTML) return alert('Belum ada transaksi untuk dicetak ulang.');
  if (LAST_REPRINT_COUNT >= 1) return alert('Batas cetak ulang (maksimal 1x) sudah tercapai!');
  LAST_REPRINT_COUNT++;
  document.getElementById('thermalReceiptArea').innerHTML = LAST_RECEIPT_HTML;
  window.print();
}

async function openCashDropModal() {
  const nom = prompt('CASH DROP BRANKAS\nMasukkan nominal uang tunai yang disetor ke brankas (Rp):');
  if (!nom) return;
  try {
    const res = await ApiClient.call('finance/cash-flow', { jenis: 'CASH_DROP', nominal: Number(nom), keterangan: 'Cash drop shift kasir' });
    alert(res.message);
  } catch (e) {
    alert(e.message);
  }
  focusScanner();
}

async function manualKickDrawer() {
  const pin = prompt('BUKA LACI MANUAL [F11]\nMasukkan PIN Kepala Toko / Supervisor:');
  if (!pin) return;
  try {
    const auth = await ApiClient.call('auth/verify-pin', { pin });
    await ApiClient.call('security/audit-log', {
      supervisorId: auth.supervisor.idUser,
      actionType: 'MANUAL_OPEN_DRAWER',
      detail: 'Pembukaan laci uang manual via F11'
    });
    document.getElementById('thermalReceiptArea').innerHTML = '<div class="receipt">&nbsp;</div>';
    window.print();
  } catch (e) {
    alert('Gagal membuka laci: ' + e.message);
  }
  focusScanner();
}

function openSearchModal() {
  document.getElementById('searchModal').style.display = 'flex';
  document.getElementById('localSearchInput').value = '';
  document.getElementById('localSearchInput').focus();
  runLocalSearch();
}

async function runLocalSearch() {
  const kw = document.getElementById('localSearchInput').value;
  const results = await LocalDB.searchProducts(kw);
  document.getElementById('searchResultBody').innerHTML = results.map(p => `
    <tr style="cursor:pointer;" onclick='addToCart(${JSON.stringify(p)}, 1); closeModals();'>
      <td>${p.barcode}</td>
      <td><strong>${p.name}</strong> <small style="color:#64748B;">(${p.unit || 'PCS'})</small></td>
      <td class="num">Rp ${p.price.toLocaleString('id-ID')}</td>
    </tr>
  `).join('');
}

function openCustomerDisplay() {
  window.open('display.html', 'POSCustomerDisplay', 'width=1024,height=768');
}

// === MODUL TRANSAKSI NON-FISIK: PPOB & TARIK TUNAI [F5 / F7] ===
function openNonPhysicalModal() {
  const modal = document.getElementById('modal-non-physical');
  if (modal) {
    modal.style.display = 'flex';
    switchNonPhysicalTab('PPOB');
  }
}

function switchNonPhysicalTab(mode) {
  const isPpob = mode === 'PPOB';
  document.getElementById('form-ppob').style.display = isPpob ? 'block' : 'none';
  document.getElementById('form-cashout').style.display = isPpob ? 'none' : 'block';

  document.getElementById('tab-btn-ppob').style.background = isPpob ? '#2563EB' : '#F8FAFC';
  document.getElementById('tab-btn-ppob').style.color = isPpob ? '#FFFFFF' : '#0F172A';
  document.getElementById('tab-btn-cashout').style.background = !isPpob ? '#2563EB' : '#F8FAFC';
  document.getElementById('tab-btn-cashout').style.color = !isPpob ? '#FFFFFF' : '#0F172A';
}

function addPpobToCart() {
  const category = document.getElementById('ppob-category').value;
  const target = document.getElementById('ppob-target').value.trim();
  const costPrice = Number(document.getElementById('ppob-cost').value) || 0;
  const sellPrice = Number(document.getElementById('ppob-price').value) || 0;

  if (!target || sellPrice <= 0) {
    return alert('Nomor tujuan dan harga jual pelanggan wajib diisi.');
  }

  addToCart({
    barcode: 'PPOB-' + category + '-' + Date.now(),
    sku_code: 'PPOB-' + category,
    name: `[PPOB ${category}] ${target}`,
    unit: 'TRX',
    conversion_qty: 1,
    price: sellPrice,
    cost_price: costPrice || sellPrice,
    is_non_physical: true
  }, 1);

  document.getElementById('ppob-target').value = '';
  document.getElementById('ppob-cost').value = '';
  document.getElementById('ppob-price').value = '';
  closeModals();
}

async function submitCashOutTransaction() {
  const amount = Number(document.getElementById('cashout-amount').value) || 0;
  const fee = Number(document.getElementById('cashout-fee').value) || 0;
  const ref = document.getElementById('cashout-ref').value.trim();

  if (amount <= 0 || !ref) {
    return alert('Nominal tarik tunai dan nomor referensi transfer/QRIS wajib diisi.');
  }

  const totalNonTunaiMasuk = amount + fee;
  const trxId = `CO-${SESSION.store.kodeToko}-${Date.now()}`;
  const shiftId = ACTIVE_SHIFT ? ACTIVE_SHIFT.shiftId : 'SHF-OFFLINE';
  const itemsList = [{
    sku_code: 'CASH-OUT',
    name: `Tarik Tunai Rp ${amount.toLocaleString('id-ID')} (Ref: ${ref})`,
    unit: 'TRX',
    qty: 1,
    price: fee,
    discount: 0,
    cash_out_principal: amount
  }];
  const itemsJson = JSON.stringify(itemsList);
  const checksum = await SecurityModule.sha256(`${trxId}|${shiftId}|${totalNonTunaiMasuk}|${itemsJson}`);

  const trxRecord = {
    trx_id: trxId,
    shift_id: shiftId,
    timestamp: new Date().toISOString(),
    cashier_id: SESSION.user.userId,
    member_id: ACTIVE_MEMBER.member_id,
    items_json: itemsJson,
    promo_applied_json: '[]',
    subtotal: totalNonTunaiMasuk,
    discount_total: 0,
    tax_amount: 0,
    grand_total: totalNonTunaiMasuk,
    payments_json: JSON.stringify([
      { method: 'QRIS_IN', amount: totalNonTunaiMasuk },
      { method: 'CASH_OUT_DRAWER', amount: -amount }
    ]),
    trx_type: 'CASH_OUT',
    sync_status: 'PENDING',
    checksum: checksum
  };

  await LocalDB.saveTransaction(trxRecord);
  printThermalReceipt(trxRecord, itemsList, { ppnAmount: 0, cash: 0, qris: totalNonTunaiMasuk, edc: 0, tempo: 0, change: 0 }, false);

  document.getElementById('cashout-amount').value = '';
  document.getElementById('cashout-ref').value = '';
  closeModals();
  ApiClient.syncQueue();
}

// === RETUR PENJUALAN BERBASIS NOMOR STRUK [F12] ===
function openReturnModal() {
  RETURN_TARGET_TRX = null;
  document.getElementById('returnSearchTrxId').value = '';
  document.getElementById('returnTrxMeta').textContent = '';
  document.getElementById('returnItemsBody').innerHTML = '';
  document.getElementById('returnReason').value = '';
  document.getElementById('returnSpvPin').value = '';
  document.getElementById('returnModal').style.display = 'flex';
  document.getElementById('returnSearchTrxId').focus();
}

async function searchTrxForReturn() {
  const trxId = document.getElementById('returnSearchTrxId').value.trim();
  if (!trxId) return;
  try {
    const trx = await ApiClient.call('pos/find-trx', { trxId });
    RETURN_TARGET_TRX = trx;
    document.getElementById('returnTrxMeta').textContent =
      `Struk: ${trx.trx_id} | Tanggal: ${new Date(trx.timestamp).toLocaleString('id-ID')} | Kasir: ${trx.cashier_id}`;

    document.getElementById('returnItemsBody').innerHTML = trx.items.map((it, idx) => `
      <tr>
        <td><strong>${it.name}</strong><br><small>${it.barcode || it.sku_code}</small></td>
        <td class="num">Rp ${Number(it.price).toLocaleString('id-ID')}</td>
        <td class="num">${it.qty} ${it.unit || 'PCS'}</td>
        <td class="num">
          <input type="number" class="ret-qty-inp" data-idx="${idx}" min="0" max="${it.qty}" value="0" style="width:75px; margin:0;">
        </td>
      </tr>
    `).join('');
  } catch (e) {
    alert(e.message);
  }
}

async function submitSalesReturn() {
  if (!RETURN_TARGET_TRX) return alert('Cari nomor struk transaksi terlebih dahulu.');
  const supervisorPin = document.getElementById('returnSpvPin').value;
  const reason = document.getElementById('returnReason').value.trim();
  if (!supervisorPin) return alert('PIN Supervisor wajib diisi untuk memproses retur.');

  const returnItems = [];
  document.querySelectorAll('.ret-qty-inp').forEach(inp => {
    const q = Number(inp.value) || 0;
    if (q > 0) {
      const orig = RETURN_TARGET_TRX.items[Number(inp.dataset.idx)];
      returnItems.push({ ...orig, return_qty: q });
    }
  });

  if (returnItems.length === 0) return alert('Isi minimal 1 barang yang diretur.');

  try {
    const res = await ApiClient.call('pos/return-trx', {
      originalTrxId: RETURN_TARGET_TRX.trx_id,
      memberId: RETURN_TARGET_TRX.member_id,
      returnItems: returnItems,
      shiftId: ACTIVE_SHIFT ? ACTIVE_SHIFT.shiftId : 'SHF-RETURN',
      supervisorPin: supervisorPin,
      reason: reason
    });

    // Cetak bukti retur thermal
    const paperClass = SESSION.store.ukuranKertas === '58mm' ? 'paper-58' : 'paper-80';
    document.getElementById('thermalReceiptArea').innerHTML = `
      <div class="receipt ${paperClass}">
        <div style="text-align:center;">
          <strong>${SESSION.store.namaToko}</strong><br>
          <strong>*** BUKTI RETUR PENJUALAN ***</strong>
        </div>
        <hr>
        <small>No. Retur: ${res.returnTrxId}<br>Ref. Struk: ${res.originalTrxId}<br>Kasir: ${SESSION.user.nama} | SPV: ${res.supervisor}</small>
        <hr>
        ${res.items.map(i => `
          <div>${i.name}</div>
          <div style="display:flex;justify-content:space-between;">
            <span>${i.qty} x ${Number(i.price).toLocaleString('id-ID')}</span>
            <span>${(Number(i.price) * i.qty).toLocaleString('id-ID')}</span>
          </div>
        `).join('')}
        <hr>
        <div style="display:flex;justify-content:space-between;font-weight:bold;">
          <span>TOTAL REFUND TUNAI</span>
          <span>Rp ${res.totalRefund.toLocaleString('id-ID')}</span>
        </div>
        <hr>
        <div style="text-align:center;"><small>Alasan: ${reason || '-'}</small></div>
      </div>
    `;
    window.print();

    alert(`Retur berhasil (${res.returnTrxId}). Total uang dikembalikan: Rp ${res.totalRefund.toLocaleString('id-ID')}`);
    closeModals();
  } catch (e) {
    alert('Gagal memproses retur: ' + e.message);
  }
}

// === TUTUP SHIFT & BLIND DROP CLEREK (Z-REPORT THERMAL) ===
function openCloseShiftModal() {
  if (!ACTIVE_SHIFT) return alert('Tidak ada shift aktif yang terbuka.');
  if (CART.length > 0) return alert('Selesaikan atau batalkan keranjang belanja aktif sebelum menutup shift.');
  document.getElementById('closeShiftPhysicalCash').value = '';
  document.getElementById('closeShiftSpvPin').value = '';
  document.getElementById('closeShiftModal').style.display = 'flex';
  document.getElementById('closeShiftPhysicalCash').focus();
}

async function submitCloseShift() {
  const setoranFisik = Number(document.getElementById('closeShiftPhysicalCash').value);
  const supervisorPin = document.getElementById('closeShiftSpvPin').value.trim();

  if (isNaN(setoranFisik) || setoranFisik < 0) {
    return alert('Masukkan nominal uang fisik di laci dengan benar.');
  }
  if (!supervisorPin) {
    return alert('PIN Kepala Toko / Supervisor wajib diisi untuk menutup shift.');
  }
  if (!confirm('Yakin ingin menutup shift kasir sekarang?')) return;

  try {
    await ApiClient.syncQueue();
    const rep = await ApiClient.call('pos/clerek-shift', {
      shiftId: ACTIVE_SHIFT.shiftId,
      setoranFisik: setoranFisik,
      supervisorPin: supervisorPin
    });

    const paperClass = SESSION.store.ukuranKertas === '58mm' ? 'paper-58' : 'paper-80';
    document.getElementById('thermalReceiptArea').innerHTML = `
      <div class="receipt ${paperClass}">
        <div style="text-align:center;">
          <strong>${SESSION.store.namaToko}</strong><br>
          <strong>=== LAPORAN CLEREK SHIFT (Z-REPORT) ===</strong>
        </div>
        <hr>
        <small>ID Shift: ${rep.shiftId}<br>Kasir: ${SESSION.user.nama}<br>Supervisor: ${rep.supervisor}<br>Tutup: ${rep.waktuTutup}</small>
        <hr>
        <div style="display:flex;justify-content:space-between;"><span>Jumlah Struk</span><span>${rep.jumlahTrx}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Modal Awal Laci</span><span>${rep.modalAwal.toLocaleString('id-ID')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Penjualan Tunai</span><span>${rep.totalTunaiSistem.toLocaleString('id-ID')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Penjualan Non-Tunai</span><span>${rep.totalNonTunai.toLocaleString('id-ID')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Tarik Tunai Keluar</span><span>-${rep.totalCashOutLaci.toLocaleString('id-ID')}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cash Drop Brankas</span><span>-${rep.totalCashDrop.toLocaleString('id-ID')}</span></div>
        <hr>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Target Uang Laci</span><span>Rp ${rep.targetUangLaci.toLocaleString('id-ID')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Setoran Fisik Laci</span><span>Rp ${rep.setoranFisik.toLocaleString('id-ID')}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;"><span>Selisih (Variance)</span><span>Rp ${rep.selisih.toLocaleString('id-ID')}</span></div>
        <hr>
        <div style="text-align:center;"><small>Tanda Tangan Kasir & Kepala Toko</small><br><br><br>(______________) (______________)</div>
      </div>
    `;
    window.print();

    localStorage.removeItem('POS_ACTIVE_SHIFT');
    ACTIVE_SHIFT = null;
    alert(`Shift ${rep.shiftId} berhasil ditutup.\nSelisih Kas: Rp ${rep.selisih.toLocaleString('id-ID')}`);
    window.location.href = 'admin.html';
  } catch (e) {
    alert('Gagal menutup shift: ' + e.message);
  }
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
  focusScanner();
}

// Global Keyboard Shortcuts sesuai PRD v3.1 & RENE POS
document.addEventListener('keydown', function(e) {
  if (e.key === 'F1') { e.preventDefault(); openMemberModal(); }
  else if (e.key === 'F8') { e.preventDefault(); openCheckoutModal('CASH'); }
  else if (e.key === 'F10') { e.preventDefault(); openCheckoutModal('QRIS'); }
  else if (e.key === 'F2') { e.preventDefault(); openSearchModal(); }
  else if (e.key === 'F4') { e.preventDefault(); openEditItemModal(); }
  else if (e.key === 'F5' || e.key === 'F7') { e.preventDefault(); openNonPhysicalModal(); }
  else if (e.key === 'F6') { e.preventDefault(); handleHoldRecall(); }
  else if (e.key === 'F3') { e.preventDefault(); reprintLastReceipt(); }
  else if (e.key === 'F9') { e.preventDefault(); openCashDropModal(); }
  else if (e.key === 'F11') { e.preventDefault(); manualKickDrawer(); }
  else if (e.key === 'F12') { e.preventDefault(); openReturnModal(); }
  else if (e.key === 'Delete') { e.preventDefault(); voidSelectedItem(); }
  else if (e.key === 'Escape') { closeModals(); }
});