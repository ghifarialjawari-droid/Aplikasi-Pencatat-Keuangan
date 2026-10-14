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

Tab **Transaksi, Kantong, Anggaran, Kategori, dan Meta** dibuat otomatis di spreadsheet setelah sinkronisasi pertama.

## Cara kerja

- Setiap kali kamu menambah/mengubah/menghapus data, aplikasi mengirimnya ke Sheet dalam ±1,5 detik.
- Saat aplikasi dibuka (atau kembali dibuka dari latar belakang), aplikasi membandingkan waktu perubahan terakhir. **Data yang lebih baru menang**: kalau Sheet lebih baru, data lokal diperbarui; kalau data lokal lebih baru, Sheet diperbarui.
- Kamu juga bisa mengedit langsung di Spreadsheet (tambah baris transaksi, ubah anggaran, dan sebagainya). Perubahan itu terambil saat aplikasi disinkron.
  Jaga format kolom: `tanggal` memakai `YYYY-MM-DD`, `jenis` berisi `pemasukan`, `pengeluaran`, atau `transfer`.
- Tombol **Kirim ke Sheet** / **Ambil dari Sheet** di ⚙ Pengaturan untuk memaksa satu arah (akan menimpa sisi tujuan).

## Keamanan (baca ini)

Karena URL ditulis langsung di kode dan **tanpa kode rahasia**, siapa pun yang memiliki URL itu bisa membaca dan mengubah data keuanganmu. URL tersebut ikut terkirim ke browser setiap orang yang membuka aplikasi dan terlihat di repository GitHub-mu.

Artinya, **jika alamat aplikasimu publik, orang lain yang membukanya akan ikut tersambung ke spreadsheet yang sama** dan bisa melihat data keuanganmu. Beberapa cara mengurangi risikonya:

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
