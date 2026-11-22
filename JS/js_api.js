// JS/js_api.js - Konfigurasi Endpoint Backend GAS & Service Worker
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzyFxohvFDWhh73ZX8PZpnQXoBzB5pEM-HLTcN8Twu9-ABYvRMHU8CfhgF72Bk1uST0/exec';

const SESSION = JSON.parse(localStorage.getItem('POS_SESSION') || 'null');
const DEVICE_ID = localStorage.getItem('POS_DEVICE_ID') || 'UNKNOWN_DEV';

// Redirect ke login.html jika belum ada sesi (kecuali sedang di halaman login atau display)
const currentPath = window.location.pathname;
if (!SESSION && !currentPath.endsWith('login.html') && !currentPath.endsWith('display.html')) {
  window.location.href = 'login.html';
}

const ApiClient = {
  call: async function(endpoint, payload, isPublic = false) {
    const body = {
      endpoint: endpoint,
      token: isPublic ? '' : (SESSION ? SESSION.token : ''),
      deviceId: DEVICE_ID,
      storeCode: isPublic ? (payload.storeCode || '') : (SESSION ? SESSION.store.kodeToko : ''),
      clientTimestamp: new Date().toISOString(),
      payload: payload || {}
    };

    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });

    const res = await response.json();
    if (res.status === 200) {
      return res.data;
    } else {
      throw new Error(res.error || 'Terjadi kesalahan pada server.');
    }
  },

  syncQueue: async function() {
    const pill = document.getElementById('syncStatusPill');
    if (typeof LocalDB === 'undefined') return;

    if (!navigator.onLine) {
      if (pill) {
        pill.className = 'status-pill status-offline';
        pill.textContent = '● OFFLINE (Local Queue)';
      }
      return;
    }

    try {
      const pending = await LocalDB.getPendingTransactions();
      if (pending.length > 0) {
        const res = await this.call('pos/sync-trx', { transactions: pending });
        if (res.syncedIds && res.syncedIds.length > 0) {
          await LocalDB.markTransactionsSynced(res.syncedIds);
        }
      }
      if (pill) {
        pill.className = 'status-pill status-online';
        pill.textContent = '● ONLINE & SYNCED';
      }
    } catch (e) {
      if (pill) {
        pill.className = 'status-pill status-offline';
        pill.textContent = '● QUEUE PENDING';
      }
    }
  }
};

setInterval(() => ApiClient.syncQueue(), 15000);
window.addEventListener('online', () => ApiClient.syncQueue());
window.addEventListener('offline', () => ApiClient.syncQueue());

// Registrasi Service Worker (sw.js harus berada di root folder sejajar login.html)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service Worker gagal didaftarkan:', err);
    });
  });
}