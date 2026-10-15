/* Pengaturan database Google Sheets.
 *
 * Tempel URL Web App Google Apps Script di GAS_URL (berakhiran /exec), lalu simpan dan deploy ulang.
 * Selama GAS_URL kosong, aplikasi memakai penyimpanan di perangkat saja.
 * Cara membuat URL-nya: lihat PANDUAN-GOOGLE-SHEETS.md
 *
 * Satu URL dipakai semua akun. Data tiap akun disimpan di tab sendiri
 * (Ghifari_Transaksi, Anesya_Transaksi, Almeira_Transaksi, dst.).
 */
export const GAS_URL = '';

// Opsional: URL khusus untuk akun tertentu, jika ingin datanya di spreadsheet lain.
// Contoh: { anesya: 'https://script.google.com/macros/s/XXXX/exec' }
export const GAS_URLS = {};

// Opsional. Biarkan kosong jika tidak memakai kode rahasia
// (harus sama dengan TOKEN di google-apps-script/Code.gs; kosong = tanpa pemeriksaan).
export const GAS_TOKEN = '';
