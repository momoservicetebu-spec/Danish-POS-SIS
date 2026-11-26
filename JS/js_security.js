const SecurityModule = {
  IDLE_LIMIT_MS: 3 * 60 * 1000, // Auto-lock layar setelah 3 menit tanpa aktivitas
  LOCK_STORAGE_KEY: 'POS_TERMINAL_LOCKED',
  idleTimer: null,
  isLocked: false,

  init: function() {
    this.blockDevToolsAndContext();
    this.setupIdleAutoLock();
    this.checkLocalClockIntegrity();

    // Cek integritas jam komputer setiap 30 detik (bukan hanya saat load awal)
    setInterval(() => this.checkLocalClockIntegrity(), 30000);

    // Pertahankan status terkunci meskipun halaman di-refresh (F5)
    if (localStorage.getItem(this.LOCK_STORAGE_KEY) === '1') {
      this.lockScreen('Terminal terkunci. Masukkan PIN Supervisor untuk melanjutkan.');
    }
  },

  blockDevToolsAndContext: function() {
    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', e => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && ['U', 'S'].includes(e.key.toUpperCase()))
      ) {
        e.preventDefault();
        return false;
      }

      // Blokir seluruh tombol pintasan kasir di belakang layar saat terminal terkunci
      if (this.isLocked && e.target.id !== 'unlockPinInput') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);
  },

  setupIdleAutoLock: function() {
    this.injectLockOverlay();
    const resetTimer = () => {
      if (this.isLocked) return;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.lockScreen(), this.IDLE_LIMIT_MS);
    };

    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, resetTimer, { passive: true });
    });
    resetTimer();
  },

  injectLockOverlay: function() {
    if (document.getElementById('securityLockOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'securityLockOverlay';
    overlay.style.cssText = `
      display:none; position:fixed; inset:0; background:rgba(15, 23, 42, 0.97);
      backdrop-filter:blur(8px); z-index:99999; color:#fff;
      flex-direction:column; align-items:center; justify-content:center;
    `;
    overlay.innerHTML = `
      <div style="background:#1E293B; padding:32px; border-radius:16px; width:360px; max-width:92vw; text-align:center; border:1px solid #334155; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
        <div style="font-size:32px; margin-bottom:8px;">🔒</div>
        <h3 style="margin:0 0 8px;">Terminal Terkunci</h3>
        <p id="lockReasonText" style="font-size:13px; color:#94A3B8; margin-bottom:20px;">Tidak ada aktivitas selama 3 menit. Masukkan PIN Supervisor untuk membuka kembali.</p>
        <input type="password" id="unlockPinInput" placeholder="Masukkan PIN Supervisor" autocomplete="off"
          style="width:100%; padding:12px; border-radius:10px; border:1px solid #475569; background:#0F172A; color:#fff; text-align:center; font-size:18px; margin-bottom:12px; box-sizing:border-box;">
        <button id="btnUnlockTerminal" onclick="SecurityModule.unlockScreen()"
          style="width:100%; padding:12px; border-radius:10px; border:none; background:#10B981; color:#fff; font-weight:700; cursor:pointer;">Buka Kunci Terminal</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const pinInput = document.getElementById('unlockPinInput');
    if (pinInput) {
      pinInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.unlockScreen();
        }
      });
    }
  },

  lockScreen: function(customMessage = '') {
    this.isLocked = true;
    localStorage.setItem(this.LOCK_STORAGE_KEY, '1');

    // Nonaktifkan input utama kasir agar tidak bisa di-scan saat terkunci
    const scanInput = document.getElementById('barcodeInput');
    if (scanInput) scanInput.disabled = true;

    const overlay = document.getElementById('securityLockOverlay');
    if (overlay) {
      if (customMessage) {
        const msgEl = document.getElementById('lockReasonText');
        if (msgEl) msgEl.textContent = customMessage;
      }
      overlay.style.display = 'flex';
      const inp = document.getElementById('unlockPinInput');
      if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 50);
      }
    }
  },

  unlockScreen: async function() {
    const inp = document.getElementById('unlockPinInput');
    const btn = document.getElementById('btnUnlockTerminal');
    const pin = inp ? inp.value.trim() : '';
    if (!pin) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Memverifikasi PIN...';
    }

    try {
      await ApiClient.call('auth/verify-pin', { pin });
      this.isLocked = false;
      localStorage.removeItem(this.LOCK_STORAGE_KEY);

      const overlay = document.getElementById('securityLockOverlay');
      if (overlay) overlay.style.display = 'none';

      const scanInput = document.getElementById('barcodeInput');
      if (scanInput) {
        scanInput.disabled = false;
        scanInput.focus();
      }
    } catch (e) {
      alert('PIN salah atau gagal verifikasi: ' + e.message);
      if (inp) {
        inp.value = '';
        inp.focus();
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Buka Kunci Terminal';
      }
    }
  },

  checkLocalClockIntegrity: function() {
    const lastKnownServerMs = Number(localStorage.getItem('POS_LAST_SERVER_MS') || 0);
    const nowMs = Date.now();
    if (lastKnownServerMs > 0 && (lastKnownServerMs - nowMs) > 5 * 60 * 1000) {
      this.lockScreen('PERINGATAN KEAMANAN: Jam sistem komputer terdeteksi dimundurkan! Perbaiki jam sistem lalu masukkan PIN Supervisor.');
    } else if (nowMs > lastKnownServerMs) {
      localStorage.setItem('POS_LAST_SERVER_MS', String(nowMs));
    }
  },

  sha256: async function(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
};

window.addEventListener('DOMContentLoaded', () => SecurityModule.init());