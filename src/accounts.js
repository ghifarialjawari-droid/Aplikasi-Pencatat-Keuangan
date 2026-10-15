import { storage } from './lib/storage.js';

/* Daftar akun. Tambah atau ubah di sini.
 *   id     : huruf kecil/angka tanpa spasi. Dipakai untuk kunci data dan nama tab Google Sheets,
 *            jadi JANGAN diubah setelah akun dipakai.
 *   nama   : nama yang tampil
 *   sapaan : teks sapaan di Beranda dan yang diucapkan saat diketuk
 *   warna  : gradasi Tailwind untuk avatar
 */
export const ACCOUNTS = [
  { id: 'ghifari', nama: 'Ghifari', sapaan: 'Tuan Ghifari Ganteng', warna: 'from-blue-600 to-sky-500' },
  { id: 'anesya', nama: 'Anesya', sapaan: 'Anesya', warna: 'from-teal-500 to-cyan-400' },
  { id: 'almeira', nama: 'Almeira', sapaan: 'Almeira', warna: 'from-amber-400 to-orange-500' },
];

// Kunci dasar penyimpanan; setiap akun memakai kunci sendiri: "<kunci>:<id akun>"
const BASE_KEYS = {
  trx: 'pembukuan_data_v4',
  cat: 'pembukuan_categories_v4',
  wal: 'pembukuan_wallets_v1',
  bud: 'pembukuan_budget_v1',
  hide: 'pembukuan_hide_v1',
  meta: 'pembukuan_meta_v1',
};

export const keysFor = (id) => Object.fromEntries(Object.entries(BASE_KEYS).map(([k, v]) => [k, `${v}:${id}`]));

const ACTIVE_KEY = 'pembukuan_akun_aktif';

export function readActiveAccount() {
  try {
    const raw = storage.get(ACTIVE_KEY);
    const id = raw ? JSON.parse(raw) : null;
    return ACCOUNTS.find((a) => a.id === id) || null;
  } catch {
    return null;
  }
}

export function writeActiveAccount(id) {
  try { storage.set(ACTIVE_KEY, JSON.stringify(id)); } catch { /* abaikan */ }
}

/* Data yang dicatat sebelum fitur akun ada (kunci tanpa ":<akun>") dipindahkan ke akun pertama.
   Data lama tidak dihapus, hanya disalin satu kali jika akun pertama belum punya datanya. */
export function migrateLegacy() {
  try {
    const target = keysFor(ACCOUNTS[0].id);
    Object.keys(BASE_KEYS).forEach((k) => {
      const old = storage.get(BASE_KEYS[k]);
      if (old != null && storage.get(target[k]) == null) storage.set(target[k], old);
    });
  } catch { /* abaikan */ }
}
