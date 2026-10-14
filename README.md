# Pencatat Keuangan Harian

Aplikasi web untuk mencatat pemasukan dan pengeluaran harian. Dibuat dengan **React + Vite + Tailwind CSS**, tanpa backend: semua data tersimpan di browser (`localStorage`).

## Fitur

- **Catat transaksi** pemasukan (hijau) dan pengeluaran (merah) dengan kategori, tanggal, catatan, dan nominal cepat.
- **Kantong**: banyak dompet/rekening dengan saldo awal masing-masing, plus **transfer** antar kantong.
- **Anggaran**: batas per kategori dan batas total bulanan, dengan indikator hijau/kuning/merah dan info sisa anggaran saat mencatat.
- **Laporan bulanan**: surplus/defisit, perbandingan dengan bulan lalu, tren 6 bulan, pengeluaran harian, kategori teratas, salin ringkasan, dan unduh CSV.
- Riwayat dikelompokkan per hari, dengan filter jenis, kategori, dan kantong.
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

## Struktur proyek

```
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── public/favicon.svg
├── src/
│   ├── main.jsx      # titik masuk React
│   ├── index.css     # direktif Tailwind
│   └── App.jsx       # seluruh aplikasi
└── .github/workflows/deploy.yml
```

## Tentang data

Data tersimpan di `localStorage` browser dan perangkat yang dipakai, jadi **tidak otomatis tersinkron antar perangkat**, dan akan hilang jika data situs dihapus. Gunakan tombol **Unduh CSV** di tab Laporan untuk membuat cadangan per bulan.

Kunci yang dipakai: `pembukuan_data_v4` (transaksi), `pembukuan_categories_v4` (kategori), `pembukuan_wallets_v1` (kantong), `pembukuan_budget_v1` (anggaran), `pembukuan_hide_v1` (sembunyikan saldo).
