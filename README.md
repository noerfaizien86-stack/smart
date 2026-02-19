# Smart CBT (Computer Based Test) + Google Apps Script + Google Sheets

Template aplikasi CBT modern, responsif, dan mobile-friendly untuk SD/SMP dengan multi-role:
Admin Utama, Guru, Pengawas, dan Siswa.

## 1) Struktur folder project

```text
smart/
├─ frontend/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ apps-script/
│  └─ Code.gs
├─ docs/
│  └─ google-sheets-structure.md
└─ README.md
```

## 2) Kode HTML utama
File: `frontend/index.html`
- Halaman login role-based
- Sidebar menu dinamis
- Dashboard area
- Halaman ujian dengan timer, progress bar, dan navigasi soal

## 3) Kode CSS modern
File: `frontend/styles.css`
- Desain card-based modern
- Gradient UI dan icon support
- Responsif untuk mobile (off-canvas sidebar)

## 4) Kode JavaScript lengkap
File: `frontend/app.js`
Fitur utama:
- Login dan session
- Render menu berdasarkan role
- Dashboard statistik
- Mulai ujian dengan token
- Dukungan tipe soal: PG, MCMA, Uraian (dan backend menyiapkan type lain)
- Timer countdown + auto submit
- Auto save jawaban real-time
- Anti-refresh warning
- Progress bar

## 5) Kode Google Apps Script
File: `apps-script/Code.gs`
API action via `doPost` JSON:
- `login`
- `dashboard`
- `listExams`
- `startExam`
- `saveAnswer`
- `submitExam`
- `importDocx`

Sudah termasuk:
- Validasi session
- Scoring otomatis (selain uraian)
- Random soal & opsi
- Logging aktivitas

## 6) Struktur Google Sheets
Lihat detail kolom pada:
- `docs/google-sheets-structure.md`

## 7) Cara deploy sebagai Web App

1. Buka [script.new](https://script.new) dan tempel isi `apps-script/Code.gs`.
2. Simpan project Apps Script.
3. Klik **Deploy** → **New Deployment**.
4. Pilih tipe **Web app**.
5. Execute as: **Me**.
6. Who has access: **Anyone with the link** (atau domain sekolah).
7. Deploy lalu salin URL Web App.
8. Tempel URL ke `API_URL` di `frontend/app.js`.

## 8) Cara menghubungkan ke Google Sheets

1. Di Apps Script, buka spreadsheet database yang sama (bound script) atau gunakan:
   ```javascript
   SpreadsheetApp.openById('SPREADSHEET_ID')
   ```
2. Pastikan nama sheet persis sama dengan konstanta `SHEET` pada `Code.gs`.
3. Isi header kolom sesuai dokumen struktur sheet.
4. Tambahkan data user awal (minimal 1 admin).
5. Uji endpoint dengan action `login` dari frontend.

## 9) Cara import soal Word (.docx)

Arsitektur yang disarankan:
1. Upload `.docx` ke Google Drive.
2. Konversi ke Google Docs (via Drive API/otomatis).
3. Ambil teks dokumen.
4. Kirim teks mentah ke endpoint Apps Script action `importDocx`.
5. Fungsi `parseQuestionBlock()` akan parsing format:
   - `Nomor. Pertanyaan`
   - `A. ...`
   - `B. ...`
   - `C. ...`
   - `D. ...`
   - `Jawaban: A`
   - `Tipe: PG/MCMA/Kategori/BS/Uraian/Menjodohkan`

Contoh payload:
```json
{
  "action": "importDocx",
  "ujianId": "UJ001",
  "rawText": "1. Ibu kota Indonesia adalah...\nA. Bandung\nB. Jakarta\nC. Surabaya\nD. Medan\nJawaban: B\nTipe: PG"
}
```

## 10) Cara publish agar bisa dipakai banyak sekolah

Rekomendasi produksi:
1. **Multi-tenant model**: tambah kolom `schoolId` di semua sheet utama.
2. **Isolasi data**: semua query difilter `schoolId`.
3. **Subdomain per sekolah** (opsional) untuk branding.
4. **Role policy ketat**: admin sekolah hanya akses datanya.
5. **Audit log** aktif untuk keamanan dan investigasi.
6. **Backup berkala** ke spreadsheet arsip / BigQuery.
7. **Rate limit** dan token expiry untuk endpoint sensitif.
8. Gunakan **Cloud Project standar** untuk kuota lebih tinggi.

---

## Catatan penting keamanan
- Password saat ini template dasar. Untuk produksi, wajib hash (minimal SHA-256 + salt) atau integrasi Google Identity/Firebase Auth.
- Aktifkan proteksi sheet dan batasi akses akun service/admin.
- Validasi semua input agar mencegah manipulasi payload.

## Pengembangan lanjutan yang disarankan
- Import Excel untuk guru/siswa/pengawas (Sheet staging + parser)
- Cetak kartu ujian, berita acara, dan daftar hadir (template Google Docs)
- Analisis butir detail (difficulty index, discrimination index)
- Penilaian manual soal uraian + rubric scoring
