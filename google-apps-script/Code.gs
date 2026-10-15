/**
 * Pencatat Keuangan Harian — database di Google Spreadsheet
 * -----------------------------------------------------------------
 * Tempel seluruh kode ini di Extensions → Apps Script (dari spreadsheet-mu),
 * lalu Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Salin URL berakhiran /exec ke GAS_URL di src/config.js. Panduan lengkap: PANDUAN-GOOGLE-SHEETS.md
 *
 * Tiap akun punya tab sendiri, diawali nama akun: Ghifari_Transaksi, Anesya_Kantong, dst.
 */

// OPSIONAL. Kosong = tanpa kode rahasia (siapa pun yang tahu URL Web App bisa membaca/mengubah data).
// Jika diisi, isi juga GAS_TOKEN yang sama di src/config.js.
const TOKEN = '';

// Struktur tiap tab: nama kolom + format sel
const TABS = {
  Transaksi: { head: ['id', 'tanggal', 'jenis', 'kategori', 'kantong', 'dari', 'ke', 'catatan', 'jumlah'],
               fmt:  ['0', '@', '@', '@', '@', '@', '@', '@', '#,##0'] },
  Kantong:   { head: ['id', 'nama', 'ikon', 'saldo_awal'], fmt: ['@', '@', '@', '#,##0'] },
  Anggaran:  { head: ['kunci', 'batas'], fmt: ['@', '#,##0'] },
  Kategori:  { head: ['jenis', 'nama'], fmt: ['@', '@'] },
  Meta:      { head: ['kunci', 'nilai'], fmt: ['@', '@'] },
};

function doGet() {
  return json_({ ok: true, info: 'API Pencatat Keuangan aktif. Gunakan dari aplikasi.' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* abaikan */ }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (TOKEN && body.token !== TOKEN) return json_({ ok: false, error: 'Kode rahasia salah' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const akun = akun_(body.akun);
    if (body.action === 'ping') return json_({ ok: true, name: ss.getName() });
    if (body.action === 'pull') return json_({ ok: true, snapshot: read_(ss, akun) });
    if (body.action === 'push') {
      write_(ss, akun, body.snapshot || {});
      return json_({ ok: true, updatedAt: (body.snapshot || {}).updatedAt || 0 });
    }
    return json_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (err2) { /* abaikan */ }
  }
}

/** Jika kamu mengedit data langsung di Spreadsheet, aplikasi akan mengambilnya saat dibuka/disinkron. */
function onEdit(e) {
  const name = e.range.getSheet().getName();
  const i = name.indexOf('_');
  const prefix = i > 0 ? name.slice(0, i + 1) : '';
  const base = i > 0 ? name.slice(i + 1) : name;
  if (!TABS[base] || base === 'Meta') return;
  const meta = sheet_(SpreadsheetApp.getActiveSpreadsheet(), prefix + 'Meta', 'Meta');
  meta.getRange('A2').setValue('updatedAt');
  meta.getRange('B2').setValue(String(Date.now()));
}

/* ----------------------------- helper ----------------------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Hanya huruf kecil/angka (mencegah nama tab aneh). Kosong = tanpa akun (kompatibel dengan versi lama).
function akun_(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

// "ghifari" + "Transaksi" → "Ghifari_Transaksi"
function tab_(akun, base) {
  return akun ? akun.charAt(0).toUpperCase() + akun.slice(1) + '_' + base : base;
}

function sheet_(ss, tabName, base) {
  let sh = ss.getSheetByName(tabName);
  if (!sh) {
    sh = ss.insertSheet(tabName);
    const t = TABS[base];
    sh.getRange(1, 1, 1, t.head.length).setNumberFormat('@').setValues([t.head]);
  }
  return sh;
}

function put_(ss, akun, base, rows) {
  const t = TABS[base];
  const sh = sheet_(ss, tab_(akun, base), base);
  const cols = t.head.length;
  sh.clearContents();
  // Format diatur SEBELUM mengisi nilai: kolom teks tidak diubah otomatis (tanggal / rumus)
  const total = rows.length + 1;
  sh.getRange(1, 1, total, cols).setNumberFormats([Array(cols).fill('@')]
    .concat(rows.map(function () { return t.fmt; })));
  sh.getRange(1, 1, 1, cols).setValues([t.head])
    .setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  sh.setFrozenRows(1);
}

function write_(ss, akun, snap) {
  const trx = (snap.transactions || []).map(function (t) {
    return t.type === 'transfer'
      ? [t.id, t.date, 'transfer', '', '', t.from || '', t.to || '', t.note || '', t.amount]
      : [t.id, t.date, t.type, t.category || '', t.wallet || 'utama', '', '', t.note || '', t.amount];
  });
  const wallets = (snap.wallets || []).map(function (w) { return [w.id, w.name, w.emoji || '', w.initial || 0]; });
  const budgets = Object.keys(snap.budgets || {}).map(function (k) {
    return [k === '__total' ? 'TOTAL' : k, snap.budgets[k]];
  });
  const cats = [];
  ['pemasukan', 'pengeluaran'].forEach(function (type) {
    ((snap.categories || {})[type] || []).forEach(function (n) { cats.push([type, n]); });
  });

  put_(ss, akun, 'Transaksi', trx);
  put_(ss, akun, 'Kantong', wallets);
  put_(ss, akun, 'Anggaran', budgets);
  put_(ss, akun, 'Kategori', cats);
  put_(ss, akun, 'Meta', [['updatedAt', String(snap.updatedAt || Date.now())]]);
}

function rows_(ss, akun, base) {
  const sh = ss.getSheetByName(tab_(akun, base));
  if (!sh || sh.getLastRow() < 2) return [];
  const t = TABS[base];
  return sh.getRange(2, 1, sh.getLastRow() - 1, t.head.length).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; });
}

function text_(ss, v) {
  if (v instanceof Date) return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v == null ? '' : v);
}

function read_(ss, akun) {
  const transactions = rows_(ss, akun, 'Transaksi').map(function (r) {
    const base = { id: Number(r[0]), date: text_(ss, r[1]), amount: Number(r[8]) || 0, note: text_(ss, r[7]) };
    if (text_(ss, r[2]) === 'transfer') {
      return Object.assign(base, { type: 'transfer', from: text_(ss, r[5]), to: text_(ss, r[6]) });
    }
    return Object.assign(base, { type: text_(ss, r[2]), category: text_(ss, r[3]), wallet: text_(ss, r[4]) || 'utama' });
  });

  const wallets = rows_(ss, akun, 'Kantong').map(function (r) {
    return { id: text_(ss, r[0]), name: text_(ss, r[1]), emoji: text_(ss, r[2]) || '👛', initial: Number(r[3]) || 0 };
  });

  const budgets = {};
  rows_(ss, akun, 'Anggaran').forEach(function (r) {
    const key = text_(ss, r[0]);
    const limit = Number(r[1]);
    if (limit > 0) budgets[key === 'TOTAL' ? '__total' : key] = limit;
  });

  const categories = { pemasukan: [], pengeluaran: [] };
  rows_(ss, akun, 'Kategori').forEach(function (r) {
    const type = text_(ss, r[0]);
    if (categories[type]) categories[type].push(text_(ss, r[1]));
  });

  const metaRows = rows_(ss, akun, 'Meta');
  const updatedAt = metaRows.length ? Number(metaRows[0][1]) || 0 : 0;
  return { updatedAt: updatedAt, transactions: transactions, categories: categories, wallets: wallets, budgets: budgets };
}
