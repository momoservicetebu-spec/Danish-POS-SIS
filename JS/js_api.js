// JS/js_api.js - Konfigurasi Endpoint Backend GAS, Auto-Sync & Indikator Status Jaringan
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzyFxohvFDWhh73ZX8PZpnQXoBzB5pEM-HLTcN8Twu9-ABYvRMHU8CfhgF72Bk1uST0/exec';

const SESSION = JSON.parse(localStorage.getItem('POS_SESSION') || 'null');
const DEVICE_ID = localStorage.getItem('POS_DEVICE_ID') || 'UNKNOWN_DEV';

// Redirect ke login.html jika belum ada sesi (kecuali sedang di halaman login atau display)
const currentPath = window.location.pathname;
if (!SESSION && !currentPath.endsWith('login.html') && !currentPath.endsWith('display.html')) {
  window.location.href = 'login.html';
}

const ApiClient = {
  _isSyncing: false,

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

  updateSyncBadge: function(state, pendingCount = 0) {
    const pill = document.getElementById('syncStatusPill');
    if (!pill) return;

    pill.style.cursor = 'pointer';
    pill.title = 'Klik untuk memaksa sinkronisasi sekarang';
    if (!pill.dataset.boundClick) {
      pill.dataset.boundClick = '1';
      pill.addEventListener('click', () => ApiClient.syncQueue());
    }

    if (state === 'OFFLINE') {
      pill.className = 'status-pill status-offline';
      pill.textContent = pendingCount > 0
        ? `● OFFLINE (${pendingCount} Struk Lokal)`
        : '● MODE OFFLINE (Tersimpan Lokal)';
    } else if (state === 'SYNCING') {
      pill.className = 'status-pill status-offline';
      pill.textContent = `↻ MENYINKRONKAN (${pendingCount} Struk)...`;
    } else if (state === 'PENDING') {
      pill.className = 'status-pill status-offline';
      pill.textContent = `● ANTREAN TERTUNDA (${pendingCount} Struk)`;
    } else {
      pill.className = 'status-pill status-online';
      pill.textContent = '● ONLINE & SYNCED';
    }
  },

  syncQueue: async function() {
    if (typeof LocalDB === 'undefined') return;
    if (this._isSyncing) return;

    let pendingTrx = [];
    try {
      pendingTrx = await LocalDB.getPendingTransactions();
    } catch (e) {
      pendingTrx = [];
    }

    if (!navigator.onLine) {
      this.updateSyncBadge('OFFLINE', pendingTrx.length);
      return;
    }

    this._isSyncing = true;
    try {
      // 1. Sinkronkan Transaksi Penjualan / PPOB / Cash Out yang tertunda
      if (pendingTrx.length > 0) {
        this.updateSyncBadge('SYNCING', pendingTrx.length);
        const res = await this.call('pos/sync-trx', { transactions: pendingTrx });
        if (res.syncedIds && res.syncedIds.length > 0) {
          await LocalDB.markTransactionsSynced(res.syncedIds);
        }
      }

      // 2. Sinkronkan Log Audit Lokal (Void Item / Reprint Struk) jika ada
      if (typeof db !== 'undefined' && db.audit_logs) {
        const pendingLogs = await db.audit_logs.where('sync_status').equals('PENDING').toArray();
        for (const log of pendingLogs) {
          try {
            await this.call('security/audit-log', {
              supervisorId: log.supervisor_id || (SESSION ? SESSION.user.userId : ''),
              actionType: log.action_type,
              detail: log.detail
            });
            await db.audit_logs.update(log.id, { sync_status: 'SYNCED' });
          } catch (logErr) {
            break; // Hentikan sementara jika jaringan kembali terputus
          }
        }
      }

      const remaining = await LocalDB.getPendingTransactions();
      if (remaining.length > 0) {
        this.updateSyncBadge('PENDING', remaining.length);
      } else {
        this.updateSyncBadge('ONLINE', 0);
      }
    } catch (e) {
      const remaining = await LocalDB.getPendingTransactions().catch(() => pendingTrx);
      this.updateSyncBadge('PENDING', remaining.length);
    } finally {
      this._isSyncing = false;
    }
  }
};

// Jalankan pengecekan awal segera setelah DOM siap, lalu setiap 15 detik
window.addEventListener('DOMContentLoaded', () => ApiClient.syncQueue());
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