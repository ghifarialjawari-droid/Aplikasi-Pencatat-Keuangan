/* Lapisan penyimpanan: pakai localStorage bila tersedia; kalau diblokir
   (mis. iframe ber-sandbox) jatuh ke memori supaya aplikasi tetap bisa dipakai. */
const memoryStore = {};

export const storage = (() => {
  try {
    const k = '__cek_storage__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return { ok: true, get: (x) => window.localStorage.getItem(x), set: (x, v) => window.localStorage.setItem(x, v) };
  } catch {
    return { ok: false, get: (x) => (x in memoryStore ? memoryStore[x] : null), set: (x, v) => { memoryStore[x] = v; } };
  }
})();
