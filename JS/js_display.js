const channel = new BroadcastChannel('POS_CUSTOMER_DISPLAY');
let idleResetTimer = null;

// Slideshow Promo Otomatis saat Kasir Kosong
const slides = [
  {
    badge: 'TEBUS MURAH (PWP)',
    title: 'Belanja Min. Rp 50.000 Tebus Murah Produk Pilihan!',
    desc: 'Tanyakan kepada kasir kami untuk daftar produk Tebus Murah hari ini.'
  },
  {
    badge: 'HARGA GROSIR OTOMATIS',
    title: 'Beli Lebih Banyak, Harga Satuan Lebih Hemat!',
    desc: 'Potongan harga bertingkat langsung terhitung otomatis di kasir.'
  },
  {
    badge: 'MEMBER & LOYALTY POIN',
    title: 'Kumpulkan Poin Setiap Belanja & Tukar Diskon Langsung!',
    desc: 'Daftarkan nomor HP Anda secara gratis di kasir sekarang.'
  }
];

let slideIdx = 0;
setInterval(() => {
  slideIdx = (slideIdx + 1) % slides.length;
  document.getElementById('slideBadge').textContent = slides[slideIdx].badge;
  document.getElementById('slideTitle').textContent = slides[slideIdx].title;
  document.getElementById('slideDesc').textContent = slides[slideIdx].desc;
}, 6000);

setInterval(() => {
  document.getElementById('idleClock').textContent = new Date().toLocaleString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}, 1000);

function switchToIdle() {
  document.getElementById('activeScreen').style.display = 'none';
  document.getElementById('idleScreen').style.display = 'flex';
  document.getElementById('qrisBox').style.display = 'none';
  document.getElementById('changeBox').style.display = 'none';
}

function switchToActive() {
  clearTimeout(idleResetTimer);
  document.getElementById('idleScreen').style.display = 'none';
  document.getElementById('activeScreen').style.display = 'grid';
}

// Terima Sinyal Real-Time 0ms dari Layar Kasir (kasir.html)
channel.onmessage = function(event) {
  const data = event.data;
  if (!data) return;

  if (data.storeName) {
    document.getElementById('dispStoreName').textContent = data.storeName;
    const idleTitle = document.getElementById('idleStoreTitle');
    if (idleTitle) idleTitle.textContent = data.storeName.toUpperCase();
  }

  if (data.type === 'IDLE') {
    switchToIdle();
  }
  else if (data.type === 'CART_UPDATE') {
    switchToActive();
    document.getElementById('qrisBox').style.display = 'none';
    document.getElementById('changeBox').style.display = 'none';

    // Tampilkan Profil Member jika bukan Pelanggan Umum
    const memberBar = document.getElementById('dispMemberBar');
    if (data.member && data.member.member_id && data.member.member_id !== 'MBR-000') {
      memberBar.style.display = 'flex';
      document.getElementById('dispMemberName').textContent = `${data.member.name} (${data.member.price_level})`;
      document.getElementById('dispMemberPoints').textContent = `${Number(data.member.points || 0).toLocaleString('id-ID')} Poin`;
    } else {
      memberBar.style.display = 'none';
    }

    const items = data.items || [];
    document.getElementById('dispItemCount').textContent = items.reduce((s, i) => s + i.qty, 0) + ' Item';

    document.getElementById('dispCartBody').innerHTML = items.map(it => `
      <tr>
        <td>
          <strong>${it.name}</strong>
          ${it.promoLabel ? `<br><small style="color:#7C3AED;font-weight:700;">${it.promoLabel}</small>` : ''}
        </td>
        <td class="num">${it.qty}</td>
        <td class="num">${it.price.toLocaleString('id-ID')}</td>
        <td class="num"><strong>${((it.price * it.qty) - (it.discount || 0)).toLocaleString('id-ID')}</strong></td>
      </tr>
    `).join('');

    // Tampilkan Banner Tebus Murah (PWP) jika memenuhi syarat
    const pwpBanner = document.getElementById('dispPwpBanner');
    if (data.summary && data.summary.pwpOffers && data.summary.pwpOffers.length > 0) {
      pwpBanner.style.display = 'block';
      pwpBanner.textContent = `Selamat! Anda berhak Tebus Murah produk pilihan seharga Rp ${Number(data.summary.pwpOffers[0].promo_price).toLocaleString('id-ID')}.`;
    } else {
      pwpBanner.style.display = 'none';
    }

    document.getElementById('dispSubtotal').textContent = 'Rp ' + data.summary.subtotal.toLocaleString('id-ID');
    document.getElementById('dispDiscount').textContent = '- Rp ' + data.summary.totalDiscount.toLocaleString('id-ID');
    document.getElementById('dispGrandTotal').textContent = 'Rp ' + data.summary.grandTotal.toLocaleString('id-ID');
  }
  else if (data.type === 'SHOW_QRIS') {
    switchToActive();
    document.getElementById('changeBox').style.display = 'none';
    const qrisBox = document.getElementById('qrisBox');
    qrisBox.style.display = 'block';
    document.getElementById('qrisNominal').textContent = 'Rp ' + Number(data.amount).toLocaleString('id-ID');
    document.getElementById('qrisImage').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=QRIS-POS-${data.amount}`;
  }
  else if (data.type === 'PAYMENT_DONE') {
    switchToActive();
    document.getElementById('qrisBox').style.display = 'none';
    const changeBox = document.getElementById('changeBox');
    changeBox.style.display = 'block';
    document.getElementById('dispChange').textContent = 'Rp ' + Number(data.change).toLocaleString('id-ID');

    idleResetTimer = setTimeout(() => switchToIdle(), 8000);
  }
};