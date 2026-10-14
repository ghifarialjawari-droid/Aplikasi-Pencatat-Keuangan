# Pencatat Keuangan Harian

Aplikasi web untuk mencatat pemasukan dan pengeluaran harian. Dibuat dengan **React + Vite + Tailwind CSS**, tanpa backend: semua data tersimpan di browser (`localStorage`).

## Fitur

- **Catat transaksi** pemasukan (hijau) dan pengeluaran (merah) dengan kategori, tanggal, catatan, dan nominal cepat.
- **Kantong**: banyak dompet/rekening dengan saldo awal masing-masing, plus **transfer** antar kantong.
- **Anggaran**: batas per kategori dan batas total bulanan, dengan indikator hijau/kuning/merah dan info sisa anggaran saat mencatat.
- **Laporan bulanan**: surplus/defisit, perbandingan dengan bulan lalu, tren 6 bulan, pengeluaran harian, kategori teratas, salin ringkasan, dan unduh CSV.
- Riwayat dikelompokkan per hari, dengan filter jenis, kategori, dan kantong.
- **Suara sapaan**: ketuk nama di bagian atas, aplikasi mengucapkan "Selamat pagi/siang/sore/malam, Tuan Ghifari Ganteng" sesuai jam (Web Speech API bawaan browser).
- **Database Google Spreadsheet**: data otomatis disalin ke spreadsheet-mu lewat Google Apps Script dan dipakai bersama di HP dan PC. Lihat [PANDUAN-GOOGLE-SHEETS.md](PANDUAN-GOOGLE-SHEETS.md).
- **Bisa diinstal (PWA)** di PC, Android, dan iPhone, serta tetap terbuka saat offline.
- Sembunyikan saldo, urungkan hapus, dan tanpa library chart (ringan).

## Menjalankan di komputer

Butuh [Node.js](https://nodejs.org) versi 18 atau lebih baru.

```bash
npm install
npm run dev       # buka alamat yang tampil di terminal (biasanya http://localhost:5173)
```

Build produksi:

```bash
npm run build     # hasil di folder dist/
npm run preview   # coba hasil build secara lokal
```

## Deploy ke GitHub Pages

1. Buat repository baru di GitHub, lalu unggah seluruh isi folder ini:

   ```bash
   git init
   git add .
   git commit -m "Pencatat keuangan harian"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```

2. Di GitHub buka **Settings → Pages**, pada **Source** pilih **GitHub Actions**.
3. Setiap `git push` ke branch `main` akan membangun dan menerbitkan aplikasi otomatis (lihat tab **Actions**).
   Alamatnya: `https://USERNAME.github.io/NAMA-REPO/`.

## Instal sebagai aplikasi (PC / HP)

Setelah dibuka lewat alamat `https://…` (mis. GitHub Pages atau Vercel):

- **Chrome / Edge (PC & Android)**: ketuk ikon **Instal** di kolom alamat, atau tombol **Instal sekarang** di ⚙ Pengaturan.
- **iPhone / iPad**: buka lewat **Safari** → tombol **Bagikan** → **Tambah ke Layar Utama**.

Aplikasi yang terpasang terbuka tanpa bilah browser, punya ikon sendiri, dan bisa dipakai offline.
Setelah ada versi baru, tutup lalu buka lagi aplikasinya sekali agar versi terbaru terpakai.

## Struktur proyek

```
├── index.html
├── package.json
├── vite.config.js · tailwind.config.js · postcss.config.js
├── PANDUAN-GOOGLE-SHEETS.md        # cara membuat database di Google Sheets
├── google-apps-script/Code.gs      # kode yang ditempel di Apps Script
├── design/                         # sumber logo (SVG + PNG 1024)
├── public/
│   ├── manifest.webmanifest        # agar bisa diinstal
│   ├── sw.js                       # service worker (offline)
│   ├── favicon.svg
│   └── icons/                      # ikon 192/512, maskable, apple-touch, favicon
├── src/
│   ├── main.jsx                    # titik masuk React + daftar service worker
│   ├── index.css                   # direktif Tailwind
│   ├── App.jsx                     # tampilan dan logika aplikasi
│   ├── components/Logo.jsx
│   └── lib/
│       ├── speech.js               # suara sapaan
│       ├── sheetSync.js            # sinkronisasi Google Sheets
│       └── pwa.js                  # tombol instal + service worker
└── .github/workflows/deploy.yml
```

## Tentang data

Data selalu tersimpan di `localStorage` browser (cepat dan bisa offline). **Tanpa Google Sheets**, data hanya ada di perangkat itu dan hilang jika data situs dihapus. **Dengan Google Sheets** (⚙ Pengaturan), data juga disalin ke spreadsheet-mu dan tersinkron antar perangkat. Tombol **Unduh CSV** di tab Laporan tetap bisa dipakai sebagai cadangan per bulan.

Kunci yang dipakai: `pembukuan_data_v4` (transaksi), `pembukuan_categories_v4` (kategori), `pembukuan_wallets_v1` (kantong), `pembukuan_budget_v1` (anggaran), `pembukuan_hide_v1` (sembunyikan saldo), `pembukuan_meta_v1` (waktu perubahan terakhir), `pembukuan_sync_v1` (pengaturan Google Sheets).
