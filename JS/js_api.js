// JS/js_api.js - Konfigurasi Endpoint Backend GAS, Auto-Sync & Keamanan Sesi
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzyFxohvFDWhh73ZX8PZpnQXoBzB5pEM-HLTcN8Twu9-ABYvRMHU8CfhgF72Bk1uST0/exec';

function readActiveSession() {
  try {
    return JSON.parse(
      localStorage.getItem('POS_SESSION') ||
      localStorage.getItem('DANISH_POS_SESSION') ||
      'null'
    );
  } catch (e) {
    return null;
  }
}

const SESSION = readActiveSession();
const DEVICE_ID = localStorage.getItem('POS_DEVICE_ID') || 'UNKNOWN_DEV';

// Redirect ke login.html jika belum ada sesi (kecuali sedang di halaman login atau display)
const currentPath = window.location.pathname;
if (!SESSION && !currentPath.endsWith('login.html') && !currentPath.endsWith('display.html')) {
  window.location.href = 'login.html';
}

const ApiClient = {
  _isSyncing: false,

  forceLogout: function(reason = '') {
    localStorage.removeItem('POS_SESSION');
    localStorage.removeItem('DANISH_POS_SESSION');
    sessionStorage.removeItem('POS_SESSION');
    sessionStorage.removeItem('DANISH_POS_SESSION');
    if (reason) alert(reason);
    if (!window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
  },

  call: async function(endpoint, payload, isPublic = false) {
    const activeSess = readActiveSession();
    const storeCode = isPublic
      ? (payload?.storeCode || '')
      : (activeSess?.store?.kodeToko || activeSess?.storeCode || '');

    const body = {
      endpoint: endpoint,
      token: isPublic ? '' : (activeSess?.token || ''),
      deviceId: DEVICE_ID,
      storeCode: storeCode,
      clientTimestamp: new Date().toISOString(),
      payload: payload || {}
    };

    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });

    const res = await response.json();

    // Perbarui referensi waktu server jika tersedia untuk mencegah manipulasi jam lokal
    if (res.serverTimestamp) {
      const srvMs = Date.parse(res.serverTimestamp);
      if (!isNaN(srvMs)) localStorage.setItem('POS_LAST_SERVER_MS', String(srvMs));
    }

    if (res.status === 200) {
      return res.data;
    } else if (!isPublic && (res.status === 401 || res.status === 403)) {
      this.forceLogout('Sesi login Anda telah berakhir atau tidak valid. Silakan login kembali.');
      throw new Error(res.error || 'Sesi tidak valid.');
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
        if (res && Array.isArray(res.syncedIds) && res.syncedIds.length > 0) {
          await LocalDB.markTransactionsSynced(res.syncedIds);
        }
      }

      // 2. Sinkronkan Log Audit Lokal (Perbaikan: gunakan log.log_id sesuai skema Dexie)
      if (typeof db !== 'undefined' && db.audit_logs) {
        const pendingLogs = await db.audit_logs.where('sync_status').equals('PENDING').toArray();
        for (const log of pendingLogs) {
          try {
            await this.call('security/audit-log', {
              supervisorId: log.supervisor_id || (readActiveSession()?.user?.idUser || ''),
              actionType: log.action_type,
              detail: log.detail
            });
            await db.audit_logs.update(log.log_id, { sync_status: 'SYNCED' });
          } catch (logErr) {
            break;
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

window.addEventListener('DOMContentLoaded', () => ApiClient.syncQueue());
setInterval(() => ApiClient.syncQueue(), 15000);
window.addEventListener('online', () => ApiClient.syncQueue());
window.addEventListener('offline', () => ApiClient.syncQueue());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service Worker gagal didaftarkan:', err);
    });
  });
}