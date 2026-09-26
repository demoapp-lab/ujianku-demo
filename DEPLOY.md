# Deploy manual (butuh Firebase CLI yang sudah `firebase login`)

1. Deploy rules, indexes, functions, hosting:
   ```
   firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
   ```

## Gambar soal
- Tidak ada upload via aplikasi / service account.
- Guru mengupload gambar ke Google Drive masing-masing, set akses
  “Siapa saja yang memiliki link → Pelihat”, lalu menempelkan **ID file**
  di form soal (bukan URL lengkap).

## Checklist pre-production
- [ ] Authentication Email/Password aktif di Firebase Console
- [ ] Cloud Firestore aktif + rules di-deploy
- [ ] Admin mengisi Gemini API key di halaman Pengaturan
- [ ] Buat 1 akun admin awal (Auth + dokumen users/{uid} role=admin)
