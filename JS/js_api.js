// Registrasi Service Worker agar halaman tetap bisa dibuka saat offline total
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service Worker gagal didaftarkan:', err);
    });
  });
}