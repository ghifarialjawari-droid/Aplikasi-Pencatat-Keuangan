# Panduan: Database di Google Spreadsheet

Aplikasi tetap menyimpan data di perangkat (cepat dan bisa offline), lalu **menyalinnya otomatis ke Google Spreadsheet-mu** lewat Google Apps Script. Data aman di akun Google-mu dan bisa dipakai di HP dan PC sekaligus.

Cukup dilakukan **sekali** (±5 menit). Tidak perlu kode rahasia.

## 1. Buat spreadsheet

1. Buka <https://sheets.new> (masuk dengan akun Google).
2. Beri nama, misalnya **Database Keuangan**.
   (Gunakan spreadsheet baru khusus aplikasi ini. Jangan pakai spreadsheet aplikasi lain, karena skrip ini mengatur isi tab-tabnya.)

## 2. Pasang skrip

1. Di spreadsheet, klik **Extensions → Apps Script**.
2. Hapus semua kode bawaan, lalu tempel seluruh isi [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
3. Klik ikon **Save** (💾).

## 3. Terbitkan sebagai Web App

1. Klik **Deploy → New deployment**.
2. Klik ikon roda gigi ⚙ di samping "Select type", pilih **Web app**.
3. Isi:
   - **Execute as**: *Me* (akunmu)
   - **Who has access**: *Anyone*
4. Klik **Deploy**, lalu **Authorize access** → pilih akunmu.
   Jika muncul peringatan "Google hasn't verified this app": klik **Advanced → Go to … (unsafe)** → **Allow**. Ini aman karena skrip tersebut milikmu sendiri.
5. Salin **Web app URL** (berakhiran `/exec`).

## 4. Tempel URL di aplikasi

Buka berkas **`src/config.js`** dan isi `GAS_URL`:

```js
export const GAS_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
```

Simpan, lalu `git push` (Vercel/GitHub Pages akan membangun ulang otomatis).
Buka aplikasi → ikon ⚙ di kanan atas: statusnya akan berubah menjadi **Tersinkron ✓**.

Setiap akun punya tab sendiri yang dibuat otomatis setelah sinkronisasi pertama, diawali nama akunnya:

| Akun | Tab |
| --- | --- |
| Ghifari | `Ghifari_Transaksi`, `Ghifari_Kantong`, `Ghifari_Anggaran`, `Ghifari_Kategori`, `Ghifari_Meta` |
| Anesya | `Anesya_Transaksi`, `Anesya_Kantong`, … |
| Almeira | `Almeira_Transaksi`, `Almeira_Kantong`, … |

Satu URL dipakai semua akun. Kalau salah satu akun ingin datanya di spreadsheet lain (mis. di akun Google miliknya sendiri), buat spreadsheet dan Web App terpisah, lalu isi di `src/config.js`:

```js
export const GAS_URLS = { anesya: 'https://script.google.com/macros/s/XXXX/exec' };
```

> Jika sebelumnya kamu memakai versi lama tanpa akun, tab lama (`Transaksi`, `Kantong`, dst.) tidak dipakai lagi. Data Ghifari yang ada di perangkat otomatis dikirim ke tab `Ghifari_…`. Setelah memastikan datanya muncul di sana, tab lama boleh dihapus.

## Cara kerja

- Setiap kali kamu menambah/mengubah/menghapus data, aplikasi mengirimnya ke Sheet dalam ±1,5 detik.
- Saat aplikasi dibuka (atau kembali dibuka dari latar belakang), aplikasi membandingkan waktu perubahan terakhir. **Data yang lebih baru menang**: kalau Sheet lebih baru, data lokal diperbarui; kalau data lokal lebih baru, Sheet diperbarui.
- Data tiap akun tidak saling tercampur: aplikasi hanya membaca dan menulis tab milik akun yang sedang dipakai.
- Kamu juga bisa mengedit langsung di Spreadsheet (tambah baris transaksi, ubah anggaran, dan sebagainya). Perubahan itu terambil saat aplikasi disinkron.
  Jaga format kolom: `tanggal` memakai `YYYY-MM-DD`, `jenis` berisi `pemasukan`, `pengeluaran`, atau `transfer`.
- Tombol **Kirim ke Sheet** / **Ambil dari Sheet** di ⚙ Pengaturan untuk memaksa satu arah (akan menimpa sisi tujuan).

## Keamanan (baca ini)

Karena URL ditulis langsung di kode dan **tanpa kode rahasia**, siapa pun yang memiliki URL itu bisa membaca dan mengubah data keuanganmu. URL tersebut ikut terkirim ke browser setiap orang yang membuka aplikasi dan terlihat di repository GitHub-mu.

Artinya, **jika alamat aplikasimu publik, orang lain yang membukanya akan ikut tersambung ke spreadsheet yang sama** dan bisa melihat data keuanganmu. Pemilihan akun (Ghifari, Anesya, Almeira) hanya memisahkan data, **bukan** pengaman: tidak ada kata sandi, dan siapa pun bisa memilih akun mana pun. Beberapa cara mengurangi risikonya:

- Jadikan repository GitHub **Private**, dan aktifkan perlindungan kata sandi pada situs (di Vercel: **Settings → Deployment Protection**).
- Atau aktifkan kode rahasia: isi `TOKEN` di `Code.gs` *dan* `GAS_TOKEN` yang sama di `src/config.js`. Ini hanya menyulitkan orang yang melihat URL saja. Kode rahasia itu tetap tertulis di file JavaScript yang diunduh browser.
- Kosongkan `GAS_URL` jika tidak ingin memakai sinkronisasi (data hanya tersimpan di perangkat).

## Lain-lain

- Jika kamu **mengubah kode** di Apps Script, terbitkan ulang: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. URL tetap sama.
- Jika dua perangkat mengubah data **bersamaan saat offline**, perubahan yang waktunya paling akhir yang dipakai (tidak digabung).
- Spreadsheet ini sudah menjadi cadangan. Kamu juga bisa memakai **File → Version history**.

## Masalah umum

| Pesan di aplikasi | Penyebab / solusi |
| --- | --- |
| Status "Belum diatur" | `GAS_URL` di `src/config.js` masih kosong atau formatnya salah (harus `https://script.google.com/macros/s/…/exec`). |
| Tidak bisa terhubung | Cek internet; pastikan URL berakhiran `/exec` dan **Who has access = Anyone**. |
| Balasan bukan data yang valid | Akses belum "Anyone", atau memakai URL berakhiran `/dev`. Terbitkan ulang sebagai **Web app** dan pakai URL `/exec`. |
| Kode rahasia salah | `TOKEN` di Apps Script berbeda dengan `GAS_TOKEN` di `config.js` (atau salah satunya kosong). |
| Perubahan kode tidak berpengaruh | Buat **New version** di Manage deployments (lihat di atas). |
