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

// Konfigurasi Desain Layar Kasir & Struk (Tersinkronisasi dengan Admin -> Desain)
let KASIR_DESIGN_CFG = {
  preset: 'Minimarket 1',
  compScan: true,
  compActiveItem: true,
  compCatMenu: true,
  compCustomer: true,
  compTableNo: true,
  compQuickMenu: true,
  compHoldRecall: true,
  compSplit: true,
  compLogo: true,
  accentColor: '#DB2777',
  totalSize: '52px',
  strukPaperSize: '58mm',
  strukShowTaxDetail: false,
  strukShowMemberPoint: false,
  strukPrintOrderSlip: false,
  labelModel: 'RACK_TAG_3'
};

const customerChannel = new BroadcastChannel('POS_CUSTOMER_DISPLAY');

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('hdrStoreName').textContent = `${SESSION.store.namaToko} (${SESSION.store.kodeToko})`;
  document.getElementById('hdrCashierInfo').textContent = `[${SESSION.user.nama}]`;

  setInterval(() => {
    const now = new Date();
    const dStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const tStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('hdrClock').textContent = `${dStr} ${tStr}`;
  }, 1000);

  if (!ACTIVE_SHIFT || ACTIVE_SHIFT.cashierId !== SESSION.user.userId) {
    await promptOpenShift();
  } else {
    document.getElementById('hdrShiftId').textContent = `Shift: ${ACTIVE_SHIFT.shiftId}`;
  }

  ACTIVE_PROMOS = await LocalDB.getActivePromotions();
  if ((await db.products.count()) === 0) {
    await syncMasterNow();
  }

  await initKasirDesignConfig();
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
    await applyKasirDesignToDOM();
    alert(`Sinkronisasi selesai: ${data.products.length} SKU, ${data.promotions.length} Promo, & ${(data.members || []).length} Member.`);
  } catch (e) {
    alert('Gagal sinkron master: ' + e.message);
  }
}

function focusScanner() {
  const inp = document.getElementById('barcodeInput');
  if (inp && inp.style.display !== 'none') inp.focus();
}

document.getElementById('barcodeInput').addEventListener('keydown', async function(e) {
  if (e.key === 'ArrowDown' && CART.length > 0) {
    e.preventDefault();
    SELECTED_INDEX = (SELECTED_INDEX + 1) % CART.length;
    renderCart();
    return;
  }
  if (e.key === 'ArrowUp' && CART.length > 0) {
    e.preventDefault();
    SELECTED_INDEX = (SELECTED_INDEX - 1 + CART.length) % CART.length;
    renderCart();
    return;
  }

  if ((e.key === '+' || e.key === '=') && this.value === '' && SELECTED_INDEX >= 0 && CART[SELECTED_INDEX]) {
    e.preventDefault();
    CART[SELECTED_INDEX].qty += 1;
    renderCart();
    return;
  }
  if (e.key === '-' && this.value === '' && SELECTED_INDEX >= 0 && CART[SELECTED_INDEX]) {
    e.preventDefault();
    if (CART[SELECTED_INDEX].qty > 1) {
      CART[SELECTED_INDEX].qty -= 1;
      renderCart();
    }
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const rawCode = this.value.trim();
    this.value = '';
    if (!rawCode) return;

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
    return `
      <tr class="${idx === SELECTED_INDEX ? 'selected' : ''}" onclick="SELECTED_INDEX=${idx}; renderCart();" style="cursor:pointer;">
        <td><strong>${item.qty}</strong> <small style="color:#64748B;">${item.unit || 'PCS'}</small></td>
        <td>
          <strong>${item.name}</strong>
          ${item.promoLabel ? `<span style="color:#7C3AED; font-size:11px; font-weight:700; margin-left:6px;">(${item.promoLabel})</span>` : ''}
        </td>
        <td class="num">${item.price.toLocaleString('id-ID')}</td>
        <td class="num" style="color:#DC2626;">${(item.discount || 0) > 0 ? '-' + item.discount.toLocaleString('id-ID') : '0'}</td>
        <td class="num"><strong>${lineTotal.toLocaleString('id-ID')}</strong></td>
      </tr>
    `;
  }).join('');

  // Update Baris Aktif Barang [Nama Barang] & Harga
  const activeItem = (SELECTED_INDEX >= 0 && CART[SELECTED_INDEX]) ? CART[SELECTED_INDEX] : CART[CART.length - 1];
  if (activeItem) {
    const activeLineTotal = (activeItem.price * activeItem.qty) - (activeItem.discount || 0);
    document.getElementById('lblActiveItemName').textContent = `${activeItem.name} (${activeItem.qty} ${activeItem.unit || 'PCS'})`;
    document.getElementById('lblActiveItemPrice').textContent = activeLineTotal.toLocaleString('id-ID');
  } else {
    document.getElementById('lblActiveItemName').textContent = '[Siap Scan Barang]';
    document.getElementById('lblActiveItemPrice').textContent = '0';
  }

  document.getElementById('lblSubItemInfo').textContent = `(Subtotal: Rp ${evalResult.subtotal.toLocaleString('id-ID')} | Hemat: Rp ${evalResult.totalDiscount.toLocaleString('id-ID')})`;
  document.getElementById('lblGrandTotal').textContent = evalResult.grandTotal.toLocaleString('id-ID');

  const pwpBox = document.getElementById('pwpAlertBox');
  if (evalResult.pwpOffers.length > 0) {
    pwpBox.style.display = 'block';
    pwpBox.textContent = `PROMO PWP AKTIF! Tebus murah barcode: ${evalResult.pwpOffers[0].reward_barcode} seharga Rp ${evalResult.pwpOffers[0].promo_price.toLocaleString('id-ID')}`;
  } else {
    pwpBox.style.display = 'none';
  }

  customerChannel.postMessage({
    type: CART.length > 0 ? 'CART_UPDATE' : 'IDLE',
    storeName: SESSION.store.namaToko,
    member: ACTIVE_MEMBER,
    items: CART,
    summary: evalResult
  });
}

// === MEMBER & CRM ===
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

// === UBAH QTY & DISKON PER BARIS [F7] ===
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

// Void Item Terpilih [F8]
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

// Clear Seluruh Keranjang [F12]
async function clearCartWithPin() {
  if (CART.length === 0) return;
  const pin = prompt('BATALKAN TRANSAKSI (CLEAR)\nMasukkan PIN Kepala Toko / Supervisor:');
  if (!pin) return;
  try {
    const auth = await ApiClient.call('auth/verify-pin', { pin });
    await db.audit_logs.add({
      timestamp: new Date().toISOString(),
      user_id: SESSION.user.userId,
      supervisor_id: auth.supervisor.idUser,
      action_type: 'CLEAR_CART',
      detail: `Membatalkan keranjang (${CART.length} baris)`,
      sync_status: 'PENDING'
    });
    CART = [];
    SELECTED_INDEX = -1;
    resetActiveMember();
    renderCart();
  } catch (e) {
    alert('Otorisasi Ditolak: ' + e.message);
  }
  focusScanner();
}

// Pending / Recall Struk [F5 / F3]
async function handleHoldRecall() {
  if (CART.length > 0) {
    const note = prompt('Simpan Transaksi Sementara (Tunda)\nCatatan nama/ciri pembeli:', 'Antrean ' + (new Date().getMinutes()));
    if (note === null) return;
    const evalRes = evaluateCartWithMember();
    await db.held_carts.put({
      hold_id: 'HOLD-' + Date.now(),
      timestamp: new Date().toISOString(),
      customer_note: note || 'Tanpa Catatan',
      total_amount: evalRes.grandTotal,
      items_json: JSON.stringify(CART)
    });
    CART = [];
    SELECTED_INDEX = -1;
    resetActiveMember();
    renderCart();
    alert(`Keranjang disimpan ke antrean Tunda (${note}).`);
    focusScanner();
  } else {
    const holds = await db.held_carts.toArray();
    if (holds.length === 0) return alert('Tidak ada transaksi tertunda.');

    document.getElementById('holdQueueBody').innerHTML = holds.map(h => {
      const items = JSON.parse(h.items_json || '[]');
      const totalQty = items.reduce((s, i) => s + i.qty, 0);
      const totalAmt = h.total_amount || items.reduce((s, i) => s + (i.price * i.qty), 0);
      return `
        <tr>
          <td><strong>${h.customer_note}</strong></td>
          <td>${new Date(h.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
          <td class="num">${totalQty} pcs</td>
          <td class="num"><strong>Rp ${totalAmt.toLocaleString('id-ID')}</strong></td>
          <td>
            <button onclick="recallHeldCart('${h.hold_id}')" style="padding:5px 10px; border-radius:6px; border:none; background:var(--emerald); color:#fff; font-weight:700; cursor:pointer;">Panggil</button>
          </td>
        </tr>
      `;
    }).join('');
    document.getElementById('holdQueueModal').style.display = 'flex';
  }
}

async function recallHeldCart(holdId) {
  const held = await db.held_carts.get(holdId);
  if (!held) return;
  CART = JSON.parse(held.items_json || '[]');
  await db.held_carts.delete(holdId);
  SELECTED_INDEX = CART.length - 1;
  closeModals();
  renderCart();
}
// Pembayaran Lengkap Multi-Channel [F9]
function openCheckoutModal(defaultMode) {
  if (CART.length === 0) return;
  const evalResult = evaluateCartWithMember();

  document.getElementById('checkoutMemberTag').textContent = `${ACTIVE_MEMBER.name} (${ACTIVE_MEMBER.points} Poin)`;
  document.getElementById('payInvoiceDiscount').value = 0;

  const redeemInp = document.getElementById('payRedeemPoints');
  document.getElementById('availPointsLbl').textContent = ACTIVE_MEMBER.points;
  redeemInp.value = 0;
  redeemInp.max = ACTIVE_MEMBER.points;
  redeemInp.disabled = ACTIVE_MEMBER.member_id === 'MBR-000' || ACTIVE_MEMBER.points <= 0;

  const sisaLimit = Math.max(0, (ACTIVE_MEMBER.credit_limit || 0) - (ACTIVE_MEMBER.current_debt || 0));
  const tempoRow = document.getElementById('tempoPaymentRow');
  document.getElementById('availCreditLbl').textContent = 'Rp ' + sisaLimit.toLocaleString('id-ID');
  document.getElementById('payTempoInput').value = 0;
  tempoRow.style.display = (ACTIVE_MEMBER.member_id !== 'MBR-000' && sisaLimit > 0) ? 'block' : 'none';

  document.getElementById('payCashInput').value = 0;
  document.getElementById('payQrisInput').value = 0;
  document.getElementById('payTransferInput').value = 0;
  document.getElementById('payTransferRef').value = '';
  document.getElementById('payEdcInput').value = 0;
  document.getElementById('payEdcRef').value = '';

  document.getElementById('checkoutModal').style.display = 'flex';
  selectFullPaymentPreset(defaultMode || 'CASH');
}

function selectFullPaymentPreset(mode) {
  const comp = getCheckoutComputation();
  document.getElementById('payCashInput').value = 0;
  document.getElementById('payQrisInput').value = 0;
  document.getElementById('payTransferInput').value = 0;
  document.getElementById('payEdcInput').value = 0;
  document.getElementById('payTempoInput').value = 0;

  if (mode === 'CASH') {
    document.getElementById('payCashInput').value = comp.netDue;
    calcChange();
    const el = document.getElementById('payCashInput');
    el.focus();
    el.select();
  } else if (mode === 'QRIS') {
    document.getElementById('payQrisProvider').value = 'QRIS';
    document.getElementById('payQrisInput').value = comp.netDue;
    customerChannel.postMessage({ type: 'SHOW_QRIS', amount: comp.netDue });
    calcChange();
    document.getElementById('payQrisInput').focus();
  } else if (mode === 'EWALLET') {
    document.getElementById('payQrisProvider').value = 'DANA';
    document.getElementById('payQrisInput').value = comp.netDue;
    calcChange();
    document.getElementById('payQrisProvider').focus();
  } else if (mode === 'TRANSFER') {
    document.getElementById('payTransferInput').value = comp.netDue;
    calcChange();
    document.getElementById('payTransferRef').focus();
  } else if (mode === 'EDC') {
    document.getElementById('payEdcInput').value = comp.netDue;
    calcChange();
    document.getElementById('payEdcRef').focus();
  }
}

function getCheckoutComputation() {
  const evalResult = evaluateCartWithMember();
  const invoiceDisc = Math.max(0, Number(document.getElementById('payInvoiceDiscount').value) || 0);
  const maxPts = ACTIVE_MEMBER.points || 0;
  const redeemPts = Math.min(maxPts, Math.max(0, Number(document.getElementById('payRedeemPoints').value) || 0));
  const redeemValue = redeemPts * 100;

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
  const qrisProvider = document.getElementById('payQrisProvider')?.value || 'QRIS';
  const transfer = Number(document.getElementById('payTransferInput')?.value) || 0;
  const bankProvider = document.getElementById('payBankProvider')?.value || 'BCA';
  const edc = Number(document.getElementById('payEdcInput').value) || 0;
  const edcType = document.getElementById('payEdcType')?.value || 'DEBIT';
  const tempo = Number(document.getElementById('payTempoInput').value) || 0;

  const totalPaid = cash + qris + transfer + edc + tempo;
  const change = totalPaid - netDue;

  return {
    evalResult, invoiceDisc, redeemPts, redeemValue, ppnAmount, netDue,
    cash, qris, qrisProvider, transfer, bankProvider, edc, edcType, tempo,
    totalPaid, change
  };
}

function calcChange() {
  const comp = getCheckoutComputation();
  document.getElementById('modalTotalDue').textContent = 'Rp ' + comp.netDue.toLocaleString('id-ID');
  document.getElementById('modalChangeVal').textContent = 'Rp ' + Math.max(0, comp.change).toLocaleString('id-ID');
}

function setQuickCash(mode) {
  const comp = getCheckoutComputation();
  const cashInp = document.getElementById('payCashInput');
  if (mode === 'EXACT') {
    const nonCash = comp.qris + comp.transfer + comp.edc + comp.tempo;
    cashInp.value = Math.max(0, comp.netDue - nonCash);
  } else {
    cashInp.value = (Number(cashInp.value) || 0) + Number(mode);
  }
  calcChange();
  cashInp.focus();
}

async function processFinalPayment() {
  const comp = getCheckoutComputation();
  const edcRef = document.getElementById('payEdcRef').value.trim();
  const transferRef = document.getElementById('payTransferRef')?.value.trim() || '';

  if (comp.totalPaid < comp.netDue) {
    return alert('Nominal pembayaran kurang dari Tagihan Akhir!');
  }
  if (comp.edc > 0 && !edcRef) {
    return alert('Nomor Approval / Kode Voucher wajib diisi!');
  }
  const sisaLimit = Math.max(0, (ACTIVE_MEMBER.credit_limit || 0) - (ACTIVE_MEMBER.current_debt || 0));
  if (comp.tempo > sisaLimit) {
    return alert(`Nominal Tempo melebihi sisa limit piutang member (Rp ${sisaLimit.toLocaleString('id-ID')})!`);
  }

  const payments = [];
  const cashNet = comp.cash > 0 ? Math.max(0, comp.cash - Math.max(0, comp.change)) : 0;
  if (cashNet > 0) payments.push({ method: 'CASH', amount: cashNet });
  if (comp.qris > 0) payments.push({ method: comp.qrisProvider, amount: comp.qris });
  if (comp.transfer > 0) payments.push({ method: `TRANSFER_${comp.bankProvider}`, amount: comp.transfer, ref: transferRef });
  if (comp.edc > 0) payments.push({ method: `EDC_${comp.edcType}`, amount: comp.edc, ref: edcRef });
  if (comp.tempo > 0) payments.push({ method: 'TEMPO', amount: comp.tempo });
  if (comp.redeemValue > 0) payments.push({ method: 'POINTS_REDEEM', amount: comp.redeemValue, points: comp.redeemPts });

  const isPurePpob = CART.every(it => it.is_non_physical === true);
  const trxType = isPurePpob ? 'PPOB' : 'SALE';
  const totalAllDiscount = comp.evalResult.totalDiscount + comp.invoiceDisc + comp.redeemValue;

  const trxId = `TRX-${SESSION.store.kodeToko}-${Date.now()}`;
  const shiftId = ACTIVE_SHIFT ? ACTIVE_SHIFT.shiftId : 'SHF-OFFLINE';
  const itemsJson = JSON.stringify(CART);

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

  if (ACTIVE_MEMBER.member_id !== 'MBR-000') {
    const earnedPts = Math.floor(comp.netDue / 10000);
    ACTIVE_MEMBER.points = Math.max(0, ACTIVE_MEMBER.points - comp.redeemPts + earnedPts);
    ACTIVE_MEMBER.current_debt = (ACTIVE_MEMBER.current_debt || 0) + comp.tempo;
    await LocalDB.upsertMember(ACTIVE_MEMBER);
  }

  printThermalReceipt(trxRecord, CART, comp, false);

  customerChannel.postMessage({ type: 'PAYMENT_DONE', grandTotal: comp.netDue, change: Math.max(0, comp.change) });
  CART = [];
  SELECTED_INDEX = -1;
  resetActiveMember();
  closeModals();
  renderCart();
  ApiClient.syncQueue();
}

function printThermalReceipt(trx, items, comp, isCopy) {
  const paperChoice = KASIR_DESIGN_CFG.strukPaperSize || SESSION.store.ukuranKertas || '58mm';
  const paperClass = paperChoice === '58mm' ? 'paper-58' : 'paper-80';
  const copyBanner = isCopy ? '<div style="text-align:center;font-weight:bold;">*** COPY STRUK ***</div>' : '';
  const tableNo = (document.getElementById('kasirTableNumberInput')?.value || '').trim();
  const earnedPts = Math.floor(trx.grand_total / 10000);
  const lineDivider = paperChoice === '58mm' ? '--------------------------------' : '------------------------------------------';

  // Konversi boolean ketat agar nilai string "false" dari server/storage tidak dianggap aktif
  const isTrue = (val) => val === true || val === 'true' || val === 1 || val === '1';
  const showTax = isTrue(KASIR_DESIGN_CFG.strukShowTaxDetail);
  const showMemberPts = isTrue(KASIR_DESIGN_CFG.strukShowMemberPoint);
  const printOrderSlip = isTrue(KASIR_DESIGN_CFG.strukPrintOrderSlip);

  const taxSection = showTax
    ? `<div>${lineDivider}</div><div><small>PAJAK: PPN 11% | DPP: ${(trx.grand_total - (comp.ppnAmount || 0)).toLocaleString('id-ID')} | PPN: ${(comp.ppnAmount || 0).toLocaleString('id-ID')}</small></div>`
    : '';

  const memberPointSection = (showMemberPts && ACTIVE_MEMBER.member_id !== 'MBR-000')
    ? `<div>${lineDivider}</div><div><small>MEMBER: ${ACTIVE_MEMBER.name}<br>POIN TRANSAKSI: +${earnedPts} | TOTAL POIN: ${ACTIVE_MEMBER.points}</small></div>`
    : '';

  const orderSlipSection = printOrderSlip
    ? `
      <div class="receipt ${paperClass}" style="page-break-before:always; margin-top:12px; padding-top:8px;">
        <div style="text-align:center; font-weight:bold;">*** SLIP PESANAN / DAPUR ***</div>
        <div><small>No: ${trx.trx_id} ${tableNo ? '| Meja: ' + tableNo : ''}<br>Pelanggan: ${ACTIVE_MEMBER.name} | ${new Date(trx.timestamp).toLocaleTimeString('id-ID')}</small></div>
        <div>${lineDivider}</div>
        ${items.map(i => `<div><strong>${i.qty}x</strong> ${i.name}</div>`).join('')}
        <div>${lineDivider}</div>
      </div>
    `
    : '';

  const html = `
    <div class="receipt ${paperClass}">
      <div style="text-align:center;">
        <strong>${SESSION.store.namaToko}</strong><br>
        <small>${SESSION.store.alamat || ''}</small>
      </div>
      ${copyBanner}
      <div>${lineDivider}</div>
      <div><small>No   : ${trx.trx_id}<br>Kasir: ${SESSION.user.nama} | ${new Date(trx.timestamp).toLocaleString('id-ID')}<br>Mbr  : ${ACTIVE_MEMBER.name}${tableNo ? ' | Meja: ' + tableNo : ''}</small></div>
      <div>${lineDivider}</div>
      ${items.map(i => `
        <div>${i.name}</div>
        <div style="display:flex;justify-content:space-between;">
          <span>${i.qty} ${i.unit || ''} x ${i.price.toLocaleString('id-ID')}</span>
          <span> = ${((i.price * i.qty) - (i.discount || 0)).toLocaleString('id-ID')}</span>
        </div>
      `).join('')}
      <div>${lineDivider}</div>
      <div style="display:flex;justify-content:space-between;"><span>Subtotal     : </span><span>${trx.subtotal.toLocaleString('id-ID')}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Diskon/Poin  : </span><span>-${trx.discount_total.toLocaleString('id-ID')}</span></div>
      ${comp.ppnAmount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>PPN (11%)    : </span><span>${comp.ppnAmount.toLocaleString('id-ID')}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>TOTAL        : </span><span>Rp ${trx.grand_total.toLocaleString('id-ID')}</span></div>
      ${comp.cash > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Tunai        : </span><span>${comp.cash.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.qris > 0 ? `<div style="display:flex;justify-content:space-between;"><span>${(comp.qrisProvider || 'QRIS').padEnd(13, ' ')}: </span><span>${comp.qris.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.transfer > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Transfer ${comp.bankProvider || ''}: </span><span>${comp.transfer.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.edc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>EDC (${comp.edcType || 'DEBIT'}): </span><span>${comp.edc.toLocaleString('id-ID')}</span></div>` : ''}
      ${comp.tempo > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Kredit/Tempo : </span><span>${comp.tempo.toLocaleString('id-ID')}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;"><span>Kembali      : </span><span>${Math.max(0, comp.change).toLocaleString('id-ID')}</span></div>
      ${taxSection}
      ${memberPointSection}
      <div>${lineDivider}</div>
      <div style="text-align:center;"><small>Terima Kasih Atas Kunjungan Anda</small></div>
      <br><br>
    </div>
    ${orderSlipSection}
  `;

  LAST_RECEIPT_HTML = html.replace('</small>\n      </div>', `</small>\n      </div><div style="text-align:center;font-weight:bold;">*** COPY STRUK ***</div>`);
  LAST_REPRINT_COUNT = 0;

  document.getElementById('thermalReceiptArea').innerHTML = html;
  window.print();
}
async function reprintLastReceipt() {
  if (!LAST_RECEIPT_HTML) return alert('Belum ada transaksi untuk dicetak ulang.');
  if (LAST_REPRINT_COUNT >= 1) return alert('Batas cetak ulang (maksimal 1x) sudah tercapai!');
  LAST_REPRINT_COUNT++;

  await db.audit_logs.add({
    timestamp: new Date().toISOString(),
    user_id: SESSION.user.userId,
    supervisor_id: SESSION.user.userId,
    action_type: 'REPRINT_RECEIPT',
    detail: 'Cetak ulang struk terakhir (1x COPY STRUK)',
    sync_status: 'PENDING'
  });

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
  const pin = prompt('BUKA LACI MANUAL\nMasukkan PIN Kepala Toko / Supervisor:');
  if (!pin) return;
  try {
    const auth = await ApiClient.call('auth/verify-pin', { pin });
    await ApiClient.call('security/audit-log', {
      supervisorId: auth.supervisor.idUser,
      actionType: 'MANUAL_OPEN_DRAWER',
      detail: 'Pembukaan laci uang manual'
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

// === MODUL TRANSAKSI NON-FISIK: PPOB & TARIK TUNAI ===
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

// === RETUR PENJUALAN BERBASIS NOMOR STRUK ===
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

    const paperChoice = KASIR_DESIGN_CFG.strukPaperSize || SESSION.store.ukuranKertas || '58mm';
    const paperClass = paperChoice === '58mm' ? 'paper-58' : 'paper-80';
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

    const paperChoice = KASIR_DESIGN_CFG.strukPaperSize || SESSION.store.ukuranKertas || '58mm';
    const paperClass = paperChoice === '58mm' ? 'paper-58' : 'paper-80';
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

// === INTEGRASI DESAIN STUDIO ADMIN KE LAYAR KASIR ===
async function initKasirDesignConfig() {
  const storeCode = SESSION?.store?.kodeToko || 'GLOBAL';
  const cacheKey = 'DANISH_DESIGN_CONFIG_' + storeCode;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      KASIR_DESIGN_CFG = { ...KASIR_DESIGN_CFG, ...JSON.parse(cached) };
      await applyKasirDesignToDOM();
    }
  } catch (e) {}

  try {
    const cloudCfg = await ApiClient.call('admin/get-design', { kodeToko: storeCode });
    if (cloudCfg && Object.keys(cloudCfg).length > 0) {
      KASIR_DESIGN_CFG = { ...KASIR_DESIGN_CFG, ...cloudCfg };
      localStorage.setItem(cacheKey, JSON.stringify(KASIR_DESIGN_CFG));
      await applyKasirDesignToDOM();
    }
  } catch (e) {
    await applyKasirDesignToDOM();
  }
}

async function applyKasirDesignToDOM() {
  const cfg = KASIR_DESIGN_CFG;

  // 1. Warna Title Bar & Ukuran Angka Sub Total
  const titleBar = document.getElementById('reneTitleBar');
  if (titleBar && cfg.accentColor) {
    titleBar.style.background = cfg.accentColor;
  }
  const grandTotalEl = document.getElementById('lblGrandTotal');
  if (grandTotalEl && cfg.totalSize) {
    grandTotalEl.style.fontSize = cfg.totalSize;
  }

  // 2. Tampilkan / Sembunyikan 9 Komponen Studio Desain
  const scanInp = document.getElementById('barcodeInput');
  if (scanInp) scanInp.style.display = cfg.compScan !== false ? 'block' : 'none';

  const activeItemBar = document.getElementById('reneActiveItemBar');
  if (activeItemBar) activeItemBar.style.display = cfg.compActiveItem !== false ? 'flex' : 'none';

  const memberBar = document.getElementById('activeMemberBar');
  if (memberBar) memberBar.style.display = cfg.compCustomer !== false ? 'flex' : 'none';

  const tableInput = document.getElementById('kasirTableNumberInput');
  if (tableInput) tableInput.style.display = cfg.compTableNo !== false ? 'block' : 'none';

  const quickGroup = document.getElementById('reneQuickMenuGroup');
  if (quickGroup) quickGroup.style.display = cfg.compQuickMenu !== false ? 'flex' : 'none';

  const btnHold = document.getElementById('btnReneHold');
  const btnRecall = document.getElementById('btnReneRecall');
  if (btnHold) btnHold.style.display = cfg.compHoldRecall !== false ? 'block' : 'none';
  if (btnRecall) btnRecall.style.display = cfg.compHoldRecall !== false ? 'block' : 'none';

  const btnSplit = document.getElementById('btnReneSplit');
  if (btnSplit) btnSplit.style.display = cfg.compSplit !== false ? 'block' : 'none';

  const logoBox = document.getElementById('reneLogoBox');
  if (logoBox) {
    logoBox.style.display = cfg.compLogo !== false ? 'flex' : 'none';
    const savedPrefs = JSON.parse(localStorage.getItem('DANISH_COMPANY_PREFS_' + (SESSION?.store?.kodeToko || 'GLOBAL')) || '{}');
    if (savedPrefs.logoUrl) {
      logoBox.innerHTML = `<img src="${savedPrefs.logoUrl}" alt="LOGO">`;
    } else {
      logoBox.textContent = 'LOGO';
    }
  }

  const lblModelSel = document.getElementById('kasirLabelModelSelect');
  if (lblModelSel && cfg.labelModel) lblModelSel.value = cfg.labelModel;

  // 3. Menu Kategori Barang (Chip Warna-Warni)
  const catBar = document.getElementById('kasirCategoryQuickBar');
  const catColors = [
    { bg: '#DCFCE7', color: '#15803D', border: '#86EFAC' },
    { bg: '#FFEDD5', color: '#C2410C', border: '#FDBA74' },
    { bg: '#D1FAE5', color: '#047857', border: '#6EE7B7' },
    { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
    { bg: '#DBEAFE', color: '#1D4ED8', border: '#93C5FD' }
  ];
  if (catBar) {
    if (cfg.compCatMenu !== false) {
      catBar.style.display = 'flex';
      const allProds = await db.products.toArray();
      const categories = [...new Set(allProds.map(p => p.category || 'Umum'))];
      catBar.innerHTML = categories.map((cat, i) => {
        const pal = catColors[i % catColors.length];
        return `
          <button type="button" onclick="openSearchByCategory('${cat.replace(/'/g, "\\'")}')" class="rene-cat-pill" style="background:${pal.bg}; color:${pal.color}; border-color:${pal.border};">
            ${cat}
          </button>
        `;
      }).join('');
    } else {
      catBar.style.display = 'none';
    }
  }
}

async function openSearchByCategory(catName) {
  openSearchModal();
  const allProds = await db.products.toArray();
  const filtered = allProds.filter(p => (p.category || 'Umum') === catName);
  document.getElementById('searchResultBody').innerHTML = filtered.map(p => `
    <tr style="cursor:pointer;" onclick='addToCart(${JSON.stringify(p)}, 1); closeModals();'>
      <td>${p.barcode}</td>
      <td><strong>${p.name}</strong> <small style="color:#64748B;">(${p.unit || 'PCS'})</small></td>
      <td class="num">Rp ${p.price.toLocaleString('id-ID')}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;">Tidak ada barang di kategori ini.</td></tr>';
}

// === CETAK LABEL HARGA & RAK DARI KASIR ===
let SELECTED_KASIR_LABELS = new Map();

function openKasirLabelModal() {
  SELECTED_KASIR_LABELS.clear();
  document.getElementById('kasirLabelSearch').value = '';
  document.getElementById('kasirLabelModal').style.display = 'flex';
  document.getElementById('kasirLabelSearch').focus();
  searchKasirLabelProducts();
}

async function searchKasirLabelProducts() {
  const kw = document.getElementById('kasirLabelSearch').value;
  const list = await LocalDB.searchProducts(kw);
  const tbody = document.getElementById('kasirLabelTableBody');

  tbody.innerHTML = list.slice(0, 40).map(p => {
    const saved = SELECTED_KASIR_LABELS.get(p.barcode);
    const checked = saved ? 'checked' : '';
    const qty = saved ? saved.qty : 1;
    return `
      <tr>
        <td>
          <input type="checkbox" ${checked} onchange='toggleKasirLabelItem(${JSON.stringify(p)}, this.checked)' style="width:16px; height:16px; margin:0;">
        </td>
        <td><strong>${p.name}</strong><br><small style="color:#64748B;">${p.barcode}</small></td>
        <td class="num">Rp ${Number(p.price || 0).toLocaleString('id-ID')}</td>
        <td class="num">
          <input type="number" min="1" max="100" value="${qty}" onchange="updateKasirLabelQty('${p.barcode}', this.value)" style="width:62px; padding:4px; margin:0; text-align:center;">
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4" style="text-align:center;">Barang tidak ditemukan.</td></tr>';
}

function toggleKasirLabelItem(prod, isChecked) {
  if (isChecked) {
    SELECTED_KASIR_LABELS.set(prod.barcode, { ...prod, qty: 1 });
  } else {
    SELECTED_KASIR_LABELS.delete(prod.barcode);
  }
}

function updateKasirLabelQty(barcode, qtyVal) {
  if (SELECTED_KASIR_LABELS.has(barcode)) {
    const item = SELECTED_KASIR_LABELS.get(barcode);
    item.qty = Math.max(1, Number(qtyVal) || 1);
    SELECTED_KASIR_LABELS.set(barcode, item);
  }
}

function printKasirSelectedLabels() {
  if (SELECTED_KASIR_LABELS.size === 0) {
    return alert('Centang minimal 1 barang terlebih dahulu untuk mencetak label.');
  }
  const model = document.getElementById('kasirLabelModelSelect').value || 'RACK_TAG_3';
  const cols = model.includes('_2') ? 2 : 3;
  const isRackTag = model.startsWith('RACK_TAG');
  const today = new Date().toLocaleDateString('id-ID');

  const cards = [];
  SELECTED_KASIR_LABELS.forEach(item => {
    for (let i = 0; i < item.qty; i++) {
      cards.push(item);
    }
  });

  const area = document.getElementById('thermalReceiptArea');
  area.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:6px; padding:6px;">
      ${cards.map(c => isRackTag ? `
        <div style="border:2px solid #000; border-radius:4px; overflow:hidden; font-family:Arial, sans-serif; break-inside:avoid;">
          <div style="background:#FACC15; color:#000; font-weight:800; font-size:10px; padding:3px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</div>
          <div style="padding:4px 6px; display:flex; justify-content:space-between; align-items:flex-end;">
            <span style="font-size:9px; font-family:monospace;">${c.barcode}<br>${today}</span>
            <span style="font-size:16px; font-weight:900;">Rp ${Number(c.price || 0).toLocaleString('id-ID')}</span>
          </div>
        </div>
      ` : `
        <div style="border:1.5px solid #000; padding:6px; text-align:center; font-family:Arial, sans-serif; break-inside:avoid;">
          <div style="font-size:10px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</div>
          <div style="font-size:9px; font-family:monospace; margin:2px 0;">${c.barcode}</div>
          <div style="font-size:16px; font-weight:900;">Rp ${Number(c.price || 0).toLocaleString('id-ID')}</div>
        </div>
      `).join('')}
    </div>
  `;

  closeModals();
  window.print();
}

// === LAYAR PENUH & KELUAR DARI HALAMAN KASIR ===
function togglePosFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function exitPosScreen() {
  if (CART.length > 0) {
    return alert('Selesaikan, Tunda (F5), atau Clear (F12) keranjang belanja terlebih dahulu sebelum keluar.');
  }

  if (SESSION?.user?.role === 'Owner' || SESSION?.user?.role === 'Kepala Toko') {
    const goAdmin = confirm('Kembali ke Dashboard Admin?\n(Shift kasir saat ini tetap aktif berjalan)');
    if (goAdmin) {
      window.location.href = 'admin.html';
    }
    return;
  }

  const doLogout = confirm('Keluar (Logout) dari akun kasir sekarang?\nCatatan: Jika pergantian shift, gunakan tombol "Tutup Shift" terlebih dahulu.');
  if (doLogout) {
    localStorage.removeItem('POS_SESSION');
    window.location.href = 'index.html';
  }
}

// Global Keyboard Shortcuts sesuai Studio Desain RENE POS
document.addEventListener('keydown', function(e) {
  if (e.key === 'F2') { e.preventDefault(); openSearchModal(); }
  else if (e.key === 'F3') { e.preventDefault(); handleHoldRecall(); }
  else if (e.key === 'F4') { e.preventDefault(); openMemberModal(); }
  else if (e.key === 'F5') { e.preventDefault(); handleHoldRecall(); }
  else if (e.key === 'F6') { e.preventDefault(); reprintLastReceipt(); }
  else if (e.key === 'F7') { e.preventDefault(); openEditItemModal(); }
  else if (e.key === 'F8') { e.preventDefault(); voidSelectedItem(); }
  else if (e.key === 'F9') { e.preventDefault(); openCheckoutModal('CASH'); }
  else if (e.key === 'F10') { e.preventDefault(); openCheckoutModal('QRIS'); }
  else if (e.key === 'F11') { e.preventDefault(); openCashDropModal(); }
  else if (e.key === 'F12') { e.preventDefault(); clearCartWithPin(); }
  else if (e.altKey && e.key === '1') { e.preventDefault(); openNonPhysicalModal(); }
  else if (e.altKey && e.key === '2') { e.preventDefault(); openReturnModal(); }
  else if (e.altKey && e.key === '3') { e.preventDefault(); manualKickDrawer(); }
  else if (e.key === 'Delete') { e.preventDefault(); voidSelectedItem(); }
  else if (e.key === 'Escape') { closeModals(); }
  else if (e.ctrlKey && e.key === 'Enter') {
    const chkModal = document.getElementById('checkoutModal');
    if (chkModal && chkModal.style.display === 'flex') {
      e.preventDefault();
      processFinalPayment();
    }
  }
});

// === HYBRID QRIS ENGINE (OFFLINE EMVCo DINAMIS + API GATEWAY) ===
let QRIS_POLL_TIMER = null;

function convertStaticQrisToDynamic(staticQris, amount) {
  if (!staticQris || staticQris.length < 20) return '';
  // Hapus 4 digit CRC lama di akhir & ubah tag 010211 (statis) -> 010212 (dinamis)
  let base = staticQris.trim().slice(0, -4).replace('010211', '010212');
  const amtStr = String(Math.round(amount));
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;

  // Sisipkan Tag 54 (Nominal) tepat sebelum Tag 5802ID (Kode Negara)
  const idx58 = base.indexOf('5802ID');
  if (idx58 !== -1) {
    base = base.slice(0, idx58) + tag54 + base.slice(idx58);
  } else {
    base += tag54;
  }

  const payloadWithCrcTag = base + '6304';
  return payloadWithCrcTag + computeCrc16Ccitt(payloadWithCrcTag);
}

function computeCrc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

async function triggerHybridQrisDisplay(amount) {
  if (QRIS_POLL_TIMER) clearInterval(QRIS_POLL_TIMER);
  const storeCode = SESSION?.store?.kodeToko || 'GLOBAL';
  const orderId = `QR-${storeCode}-${Date.now()}`;

  try {
    const res = await ApiClient.call('pos/qris-create', { kodeToko: storeCode, orderId, amount });
    if (!res.fallbackOffline && (res.qrString || res.qrImageUrl)) {
      // Mode 2: QRIS API Gateway (Midtrans / Xendit) -> Auto-Lunas saat pembeli selesai scan
      customerChannel.postMessage({
        type: 'SHOW_QRIS',
        mode: 'API_GATEWAY',
        amount,
        qrString: res.qrString,
        qrImageUrl: res.qrImageUrl
      });

      QRIS_POLL_TIMER = setInterval(async () => {
        try {
          const st = await ApiClient.call('pos/qris-status', { kodeToko: storeCode, orderId });
          if (st.status === 'PAID') {
            clearInterval(QRIS_POLL_TIMER);
            processFinalPayment(); // Otomatis cetak struk begitu terbayar!
          }
        } catch (e) {}
      }, 3000);
      return;
    }

    // Mode 1: QRIS Dinamis Offline EMVCo (Tanpa Token API)
    const dynString = convertStaticQrisToDynamic(res.staticPayload, amount);
    customerChannel.postMessage({
      type: 'SHOW_QRIS',
      mode: 'OFFLINE_EMVCO',
      amount,
      qrString: dynString
    });
  } catch (e) {
    const localStatic = localStorage.getItem('DANISH_STATIC_QRIS_' + storeCode) || '';
    const dynString = convertStaticQrisToDynamic(localStatic, amount);
    customerChannel.postMessage({ type: 'SHOW_QRIS', mode: 'OFFLINE_EMVCO', amount, qrString: dynString });
  }
}