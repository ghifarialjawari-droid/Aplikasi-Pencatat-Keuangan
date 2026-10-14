/**
 * Pencatat Keuangan Harian — database di Google Spreadsheet
 * -----------------------------------------------------------------
 * Tempel seluruh kode ini di Extensions → Apps Script (dari spreadsheet-mu),
 * ganti TOKEN di bawah, lalu Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Panduan lengkap: PANDUAN-GOOGLE-SHEETS.md
 */

// GANTI dengan kode rahasia buatanmu sendiri (huruf/angka acak, minimal 12 karakter).
// Kode yang sama harus diisi di aplikasi (⚙ Pengaturan → Kode rahasia).
const TOKEN = 'GANTI_DENGAN_KODE_RAHASIA';

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
    if (body.token !== TOKEN) return json_({ ok: false, error: 'Kode rahasia salah' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'ping') return json_({ ok: true, name: ss.getName() });
    if (body.action === 'pull') return json_({ ok: true, snapshot: read_(ss) });
    if (body.action === 'push') {
      write_(ss, body.snapshot || {});
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
  if (!TABS[name] || name === 'Meta') return;
  const meta = sheet_(SpreadsheetApp.getActiveSpreadsheet(), 'Meta');
  meta.getRange('A2').setValue('updatedAt');
  meta.getRange('B2').setValue(String(Date.now()));
}

/* ----------------------------- helper ----------------------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const t = TABS[name];
    sh.getRange(1, 1, 1, t.head.length).setNumberFormat('@').setValues([t.head]);
  }
  return sh;
}

function put_(ss, name, rows) {
  const t = TABS[name];
  const sh = sheet_(ss, name);
  const cols = t.head.length;
  sh.clearContents();
  // Format diatur SEBELUM mengisi nilai: kolom teks tidak diubah otomatis (tanggal / rumus)
  const total = rows.length + 1;
  sh.getRange(1, 1, total, cols).setNumberFormats([['@'].concat(Array(cols - 1).fill('@'))]
    .concat(rows.map(function () { return t.fmt; })));
  sh.getRange(1, 1, 1, cols).setValues([t.head])
    .setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  sh.setFrozenRows(1);
}

function write_(ss, snap) {
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

  put_(ss, 'Transaksi', trx);
  put_(ss, 'Kantong', wallets);
  put_(ss, 'Anggaran', budgets);
  put_(ss, 'Kategori', cats);
  put_(ss, 'Meta', [['updatedAt', String(snap.updatedAt || Date.now())]]);
}

function rows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const t = TABS[name];
  return sh.getRange(2, 1, sh.getLastRow() - 1, t.head.length).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; });
}

function text_(ss, v) {
  if (v instanceof Date) return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v == null ? '' : v);
}

function read_(ss) {
  const transactions = rows_(ss, 'Transaksi').map(function (r) {
    const base = { id: Number(r[0]), date: text_(ss, r[1]), amount: Number(r[8]) || 0, note: text_(ss, r[7]) };
    if (text_(ss, r[2]) === 'transfer') {
      return Object.assign(base, { type: 'transfer', from: text_(ss, r[5]), to: text_(ss, r[6]) });
    }
    return Object.assign(base, { type: text_(ss, r[2]), category: text_(ss, r[3]), wallet: text_(ss, r[4]) || 'utama' });
  });

  const wallets = rows_(ss, 'Kantong').map(function (r) {
    return { id: text_(ss, r[0]), name: text_(ss, r[1]), emoji: text_(ss, r[2]) || '👛', initial: Number(r[3]) || 0 };
  });

  const budgets = {};
  rows_(ss, 'Anggaran').forEach(function (r) {
    const key = text_(ss, r[0]);
    const limit = Number(r[1]);
    if (limit > 0) budgets[key === 'TOTAL' ? '__total' : key] = limit;
  });

  const categories = { pemasukan: [], pengeluaran: [] };
  rows_(ss, 'Kategori').forEach(function (r) {
    const type = text_(ss, r[0]);
    if (categories[type]) categories[type].push(text_(ss, r[1]));
  });

  const metaRows = rows_(ss, 'Meta');
  const updatedAt = metaRows.length ? Number(metaRows[0][1]) || 0 : 0;
  return { updatedAt: updatedAt, transactions: transactions, categories: categories, wallets: wallets, budgets: budgets };
}
