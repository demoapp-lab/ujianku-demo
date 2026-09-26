# CBT Firebase — Aplikasi Ujian Online

**Versi 1.0** · rilis: 25 September 2026

Aplikasi **Computer Based Test (CBT)** berbasis web dengan backend Firebase.
Dibangun dengan React 19 + TypeScript + Vite + Tailwind CSS.

## Fitur utama

- **3 peran**: admin, guru, siswa — masing-masing punya halaman sendiri
- **Bank soal**: pilihan ganda, benar/salah, isian singkat, esai (plus generate soal AI, opsional)
- **Ujian**: jadwal, durasi, jawaban tersimpan otomatis, timer, force submit
- **Keamanan ujian**: wajib menjawab semua soal sebelum mengumpulkan (modal petunjuk nomor kosong),
  deteksi keluar fullscreen / pindah tab, batas pelanggaran → status **Terblokir** (guru bisa buka blokir)
- **Koreksi esai**: skor manual atau otomatis via AI (Gemini), simpan nilai massal
- **Monitoring ujian real-time** + **rekap nilai** dengan ekspor CSV
- **Impor massal** pengguna, kelas, dan mata pelajaran dari Excel
- Sesi siswa per-perangkat, log login, dan pengaturan keamanan dari admin

## Teknologi

| Lapisan   | Teknologi |
|-----------|-----------|
| Frontend  | React 19, TypeScript, Vite, Tailwind CSS, React Router 7, Recharts |
| Backend   | Firebase — Authentication (admin), Cloud Firestore (semua data) |
| AI        | Google Gemini (opsional, untuk buat soal & penilaian esai) |
| Hosting   | Cloudflare Pages (auto deploy dari GitHub) |
| Deploy DB | Firebase CLI (rules + indeks Firestore) |

## Instalasi & publikasi

Panduan lengkap dari nol sampai online ada di **[Instalasi.txt](./Instalasi.txt)**,
meliputi:

1. Setup Firebase Console (Authentication, Firestore)
2. Push ke GitHub
3. Hubungkan ke Cloudflare Pages (build `npm run build`, output `dist`,
   environment variable `VITE_FIREBASE_*`)
4. Deploy rules & indeks Firestore
5. Membuat akun admin, guru, dan siswa
6. Checklist siap digunakan + troubleshooting

### Menjalankan secara lokal

```bash
git clone https://github.com/harumwibowo/cbt-firebase.git
cd cbt-firebase
npm install
copy .env.example .env    # lalu isi 6 variabel VITE_FIREBASE_*
npm run dev               # http://localhost:5173
```

### Perintah penting

```bash
npm run dev      # server development (HMR)
npm run build    # build produksi ke dist/ (tsc + vite)
npm run lint     # lint dengan oxlint
npm run preview  # pratinjau hasil build
```

## Struktur repository

```
src/                 kode aplikasi (pages, components, services, hooks, context)
public/              aset statis + _redirects (SPA fallback Cloudflare Pages)
functions/           Cloud Functions (opsional — simpan/test API key Gemini)
firestore.rules      aturan keamanan Firestore
firestore.indexes.json  indeks komposit Firestore (9 indeks)
firebase.json        konfigurasi deploy Firebase CLI
.env.example         template variabel environment (isi .env sendiri, jangan commit)
Instalasi.txt        panduan instalasi & deploy lengkap
```

## Catatan keamanan

- File `.env` dan service account JSON **tidak** ikut ke repository (lihat `.gitignore`).
- Admin memakai Firebase Auth; guru & siswa memakai login internal aplikasi
  (lihat komentar trade-off paket free di `firestore.rules`).
