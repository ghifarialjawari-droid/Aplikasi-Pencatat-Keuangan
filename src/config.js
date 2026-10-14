/* Pengaturan database Google Sheets.
 *
 * Tempel URL Web App Google Apps Script di GAS_URL (berakhiran /exec), lalu simpan dan deploy ulang.
 * Selama GAS_URL kosong, aplikasi memakai penyimpanan di perangkat saja.
 * Cara membuat URL-nya: lihat PANDUAN-GOOGLE-SHEETS.md
 */
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbxcHncanF-O6mCl3XOlvdx2vKpgXjOM4cIrioO9K5Ka3rm7l9YkFfUTTzhRVfmvptCRCg/exec';

// Opsional. Biarkan kosong jika tidak memakai kode rahasia
// (harus sama dengan TOKEN di google-apps-script/Code.gs; kosong = tanpa pemeriksaan).
export const GAS_TOKEN = 'https://script.google.com/macros/s/AKfycbxcHncanF-O6mCl3XOlvdx2vKpgXjOM4cIrioO9K5Ka3rm7l9YkFfUTTzhRVfmvptCRCg/exec';
