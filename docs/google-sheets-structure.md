# Struktur Google Sheets (Database CBT)

Buat 7 sheet berikut pada satu spreadsheet:

## 1) Users
Kolom:
`userId | nama | username | password | role | kelas | noAbsen | aktif | createdAt`

Contoh role: `admin`, `guru`, `pengawas`, `siswa`.

## 2) BankSoal
Kolom:
`soalId | ujianId | mapel | topik | tipe | pertanyaan | opsi | jawabanBenar | bobot | pembahasan | createdBy | createdAt`

Catatan:
- `opsi` format JSON array: `[{"value":"A","label":"..."}]`
- `tipe`: `PG | MCMA | Kategori | BS | Uraian | Menjodohkan`

## 3) Ujian
Kolom:
`id | namaUjian | mapel | jenjang | kelas | guruId | pengawasId | ruang | jadwalMulai | jadwalSelesai | durasiMenit | token | randomSoal | randomOpsi | tampilkanNilai | pesertaIds | status`

Catatan:
- `pesertaIds` dipisah koma.
- `status`: `draft | aktif | selesai`.

## 4) Jawaban
Kolom:
`jawabanId | ujianId | siswaId | soalId | jawaban | status | updatedAt`

Catatan:
- `jawaban` disimpan JSON string.
- `status`: `draft | submitted`.

## 5) Hasil
Kolom:
`hasilId | ujianId | siswaId | skor | benar | salah | kosong | catatanGuru | submittedAt`

## 6) LogAktivitas
Kolom:
`logId | waktu | userId | aktivitas | detail`

## 7) Session
Kolom:
`sessionId | userId | nama | role | loginAt`

> Disarankan aktifkan **Protected range** untuk sheet sensitif (Users, Hasil, Session).
