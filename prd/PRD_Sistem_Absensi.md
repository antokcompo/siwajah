# PRD — Sistem Absensi & Penggajian Harian
## Product Requirements Document

| | |
|---|---|
| **Versi** | 1.0 |
| **Tanggal** | 15 Agustus 2026 |
| **Status** | Draft — menunggu validasi kebijakan HR |
| **Pemilik produk** | \[Nama pemilik — isi manual\] |
| **Konteks industri** | Konstruksi / manajemen proyek |
| **Lokasi operasi** | Indonesia |

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Pernyataan Masalah](#2-pernyataan-masalah)
3. [Analisis Data Sumber](#3-analisis-data-sumber)
4. [Pengguna & Peran](#4-pengguna--peran)
5. [Aturan Bisnis](#5-aturan-bisnis)
6. [Kebutuhan Fungsional](#6-kebutuhan-fungsional)
7. [Kebutuhan Non-Fungsional](#7-kebutuhan-non-fungsional)
8. [Arsitektur & Teknologi](#8-arsitektur--teknologi)
9. [Desain Database](#9-desain-database)
10. [Antarmuka Pengguna](#10-antarmuka-pengguna)
11. [Keamanan](#11-keamanan)
12. [Integrasi](#12-integrasi)
13. [Peta Jalan Implementasi](#13-peta-jalan-implementasi)
14. [Kriteria Keberhasilan](#14-kriteria-keberhasilan)
15. [Risiko & Mitigasi](#15-risiko--mitigasi)
16. [Glosarium](#16-glosarium)
17. [Lampiran: Temuan Data Juni 2026](#17-lampiran-temuan-data-juni-2026)

---

## 1. Ringkasan Eksekutif

### Apa yang dibangun

Aplikasi web untuk menghitung kehadiran harian dan penggajian karyawan konstruksi, menggantikan proses manual yang sepenuhnya bergantung pada file ekspor mesin absen tanpa kontrol kualitas.

### Mengapa dibutuhkan

Analisis terhadap data mesin absen bulan Juni 2026 menunjukkan:

- **23% data hari-orang tidak bisa dihitung otomatis** karena scan tidak lengkap
- **7 hari berturut-turut (14–20 Juni)** mengalami kegagalan mesin tanpa terdeteksi
- **Estimasi 553 hari-orang tidak terekam** dengan benar dalam satu bulan
- **Tidak ada audit trail** — siapa pun bisa mengubah rekap absensi tanpa jejak
- **Tidak ada deteksi anomali** — kegagalan mesin baru diketahui 3+ minggu kemudian

Tanpa sistem, setiap bulan penggajian menghadapi risiko: membayar kurang (sengketa ketenagakerjaan) atau membayar lebih (kerugian operasional), keduanya tanpa bukti yang bisa diaudit.

### Ruang lingkup

| Masuk MVP | Tidak masuk MVP |
|---|---|
| Import data mesin absen | Aplikasi mobile karyawan |
| Perhitungan kehadiran otomatis | Integrasi langsung ke mesin absen |
| Deteksi anomali massal | Multi-lokasi / multi-proyek |
| Koreksi manual + audit trail | Slip gaji cetak |
| Approval lembur | Perhitungan PPh 21 |
| Perhitungan rupiah gaji & lembur | BPJS / potongan otomatis |
| Rekap bulanan + ekspor Excel | Cuti/izin/sakit (modul terpisah) |
| Tutup periode + kunci data | Dashboard analitik lanjutan |

---

## 2. Pernyataan Masalah

### Kondisi saat ini (As-Is)

```
Mesin absen ──ekspor file──> Excel ──hitung manual──> Rekap gaji
     │                          │                         │
     │ Tidak ada               │ Bisa diubah            │ Tidak ada
     │ deteksi gagal           │ siapa saja             │ audit trail
     │                          │                         │
     ▼                          ▼                         ▼
  Kegagalan mesin         Data dimanipulasi          Sengketa gaji
  tidak terdeteksi        tanpa jejak                tidak bisa
  berminggu-minggu                                   diselesaikan
```

### Kondisi yang diinginkan (To-Be)

```
Mesin absen ──upload file──> SISTEM ──aturan otomatis──> Draft rekap
                                │                            │
                          Deteksi anomali              Status per hari:
                          & peringatan                 LENGKAP / KOREKSI
                                │                            │
                                ▼                            ▼
                          Koreksi oleh                 Approval atasan
                          atasan + alasan              + tutup periode
                                │                            │
                                ▼                            ▼
                          Audit trail                  Rekap gaji final
                          lengkap                      + ekspor Excel
```

### Masalah inti yang diselesaikan

| # | Masalah | Dampak tanpa sistem | Solusi |
|---|---|---|---|
| M1 | Kegagalan mesin tidak terdeteksi | 553 hari-orang hilang per bulan | Deteksi anomali massal otomatis per tanggal |
| M2 | Data scan tidak selalu berpasangan | 23% gagal dihitung otomatis | Sistem status + koreksi manual terstruktur |
| M3 | Tidak ada audit trail | Sengketa gaji tidak bisa diselesaikan | Log setiap perubahan: siapa, kapan, alasan |
| M4 | Perhitungan manual rawan salah | Kelebihan/kekurangan bayar | Mesin aturan otomatis + verifikasi |
| M5 | Tidak ada kontrol akses data gaji | Semua orang bisa tahu gaji siapa saja | Role-based access + RLS |

---

## 3. Analisis Data Sumber

### Profil file mesin absen

Data berikut adalah **fakta** dari file `jun1.xlsx` (ekspor mesin absen Juni 2026):

| Parameter | Nilai |
|---|---|
| Total baris scan | 4.602 |
| Jumlah UID unik | 121 |
| Rentang tanggal | 1–30 Juni 2026 |
| Tanggal ada data | 28 dari 30 hari |
| Tanggal tanpa data | 16 Juni (Selasa), 21 Juni (Minggu) |
| Karyawan aktif (hadir ≥10 hari) | 88 |
| UID hadir <10 hari | 33 (perlu identifikasi: karyawan baru, keluar, atau salah enroll) |

### Struktur kolom file

| Kolom | Isi | Kegunaan |
|---|---|---|
| UID | ID pekerja dari mesin | Identifier utama — WAJIB dipetakan ke master karyawan |
| Kolom B (timestamp) | Tanggal + jam scan | Data utama perhitungan |
| Kolom C (nilai 0/1/255) | Tidak konsisten — tidak bisa dipakai sebagai penanda masuk/pulang | DIABAIKAN oleh sistem |
| Kolom D (selalu 15) | Tidak diketahui fungsinya | DIABAIKAN |
| Kolom E (selalu 0) | Tidak diketahui fungsinya | DIABAIKAN |

### Masalah kolom C (temuan kritis)

Kolom C berisi nilai 0, 1, dan 255. Hipotesis awal: "0 = masuk, 1 = pulang". Analisis menunjukkan ini **salah**:

- Nilai `0` muncul **1.387 kali** di jam 07 (masuk) **DAN 1.020 kali** di jam 16 (pulang)
- Nilai `1` hanya muncul jam 16 ke atas (382 total)
- Nilai `255` tersebar di semua jam (516 total)

**Kesimpulan:** kolom ini bukan penanda in/out yang bisa diandalkan. Penentuan masuk/pulang **harus** berbasis jam scan, bukan kolom ini.

### Pola scan per hari per karyawan

| Jumlah scan/hari | Kejadian | Penjelasan |
|---|---|---|
| 1 scan | 365 | Hanya masuk ATAU hanya pulang |
| 2 scan | 824 | Masuk + pulang (normal tanpa istirahat) ATAU masuk + istirahat |
| 3 scan | 768 | Masuk + istirahat + pulang (pola dominan) |
| 4 scan | 65 | Tap ganda atau masuk + istirahat + pulang + lembur |
| 5 scan | 5 | Tap ganda + lembur |

### Tap ganda (duplikat)

- 31 scan terjadi dalam interval < 2 menit dari scan sebelumnya pada UID dan tanggal yang sama
- 44 scan dalam interval < 5 menit
- **Perlakuan:** deduplikasi dengan jendela 3 menit

### Pola karyawan khusus

**UID "SAIFUL":** Tercatat sebagai teks, bukan angka (33 scan). Mesin mengirim nama, bukan ID numerik. Perlu dipetakan manual ke UID yang benar.

**UID "23":** Selama 21 hari **hanya scan 1 kali per hari**, selalu sekitar pukul 18:00. Pola terlalu konsisten untuk kelalaian — kemungkinan shift berbeda (jaga malam) atau mesin absen terpisah untuk scan masuk.

### Temuan anomali massal (14–20 Juni)

Detail lengkap ada di Lampiran. Ringkasan:

| Tanggal | Scan | Diagnosis |
|---|---|---|
| 14 Jun (Min) | 85 | 70 orang masuk, hanya 13 pulang — mesin mati sore |
| 15 Jun (Sen) | 26 | Mesin berhenti total pukul ±08:00 |
| 16 Jun (Sel) | 0 | Mesin mati total sepanjang hari |
| 17 Jun (Rab) | 99 | 77 orang masuk, mati siang–sore |
| 18 Jun (Kam) | 23 | Mati sejak pagi, hidup sebentar siang |
| 19 Jun (Jum) | 66 | Mati pagi, hidup siang–sore |
| 20 Jun (Sab) | 30 | Hidup ±1 jam saja |

**Tanggal 30 Juni:** bukan kerusakan — data terpotong karena ekspor dilakukan pukul 14:42 (sebelum karyawan pulang). Perlu ekspor ulang.

---

## 4. Pengguna & Peran

### Definisi peran

| Peran | Deskripsi | Jumlah perkiraan |
|---|---|---|
| **Admin** | Konfigurasi sistem, kelola master data, tutup periode | 1–2 orang |
| **Atasan / Mandor** | Koreksi absensi, approval lembur | 3–5 orang |
| **HRD / Payroll** | Verifikasi rekap, hitung gaji, ekspor laporan | 1–2 orang |
| **Manajemen** | Lihat dashboard dan laporan (read-only) | 1–3 orang |

Karyawan lapangan **tidak** mengakses sistem ini. Mereka hanya berinteraksi dengan mesin absen fisik.

### Matriks hak akses

| Fitur | Admin | Atasan | HRD | Manajemen |
|---|---|---|---|---|
| Kelola master karyawan | ✅ Buat/Ubah/Nonaktifkan | ❌ | 👁️ Lihat | ❌ |
| Kelola konfigurasi jam kerja | ✅ | ❌ | ❌ | ❌ |
| Upload file absensi | ✅ | ✅ | ✅ | ❌ |
| Lihat rekap harian | ✅ | ✅ (timnya) | ✅ | ✅ |
| Koreksi absensi | ✅ | ✅ (timnya) | ❌ | ❌ |
| Approval lembur | ✅ | ✅ (timnya) | ❌ | ❌ |
| Lihat/edit tarif gaji | ✅ | ❌ | ✅ | ❌ |
| Hitung rupiah gaji | ❌ | ❌ | ✅ | ❌ |
| Tutup periode | ✅ | ❌ | ✅ | ❌ |
| Ekspor rekap Excel | ✅ | ✅ (timnya) | ✅ | ✅ |
| Lihat dashboard | ✅ | ✅ (timnya) | ✅ | ✅ |
| Lihat audit log | ✅ | ❌ | ✅ | ✅ |
| Kelola pengguna sistem | ✅ | ❌ | ❌ | ❌ |

---

## 5. Aturan Bisnis

### 5.1 Jendela waktu

Semua parameter berikut disimpan di **tabel konfigurasi** dan dapat diubah oleh Admin tanpa mengubah kode.

| Parameter | Nilai default | Keterangan |
|---|---|---|
| Jendela absen MASUK | 04:00 – 10:59 | Scan paling awal dalam jendela ini = jam masuk |
| Jendela ISTIRAHAT | 11:00 – 14:29 | Scan di jendela ini **diabaikan** dari perhitungan pulang |
| Jendela absen PULANG | ≥ 14:30 | Scan paling akhir setelah jam ini = jam pulang |
| Deduplikasi | 3 menit | Scan dalam interval <3 menit dari scan sebelumnya (UID + tanggal yang sama) dianggap tap ganda dan diabaikan |

### 5.2 Status kehadiran harian

Setiap pasangan (karyawan × tanggal) menghasilkan tepat satu status:

| Status | Kondisi | Perlakuan otomatis |
|---|---|---|
| `LENGKAP` | Ada scan masuk DAN ada scan pulang | Dihitung 1 hari kerja |
| `TANPA_PULANG` | Ada scan masuk, TIDAK ada scan pulang | **Ditahan** — menunggu koreksi |
| `TANPA_MASUK` | TIDAK ada scan masuk, ada scan pulang | **Ditahan** — menunggu koreksi |
| `HANYA_SCAN_TENGAH` | Hanya ada scan di jendela istirahat | **Ditahan** — menunggu koreksi |
| `TIDAK_ADA_SCAN` | Tidak ada scan sama sekali | Alpa, kecuali ada cuti/izin/sakit |
| `INSIDEN` | Tanggal ditandai anomali massal | Perlakuan Jalur B (lihat 5.4) |

**Catatan:** hanya status `LENGKAP` yang otomatis masuk perhitungan gaji. Semua status lain memerlukan tindakan manusia.

### 5.3 Jalur A — Koreksi anomali individual

Dipicu ketika: status bukan `LENGKAP` DAN tanggal **bukan** `INSIDEN`.

| Aturan | Ketentuan |
|---|---|
| Siapa yang mengoreksi | Atasan langsung karyawan tersebut |
| Data wajib diisi | Jam masuk/pulang koreksi + alasan tertulis |
| Default jam masuk (jika hilang) | Jam kerja normal dari konfigurasi |
| Default jam pulang (jika hilang) | Jam kerja normal dari konfigurasi |
| Kuota koreksi per karyawan per bulan | Maksimal 3 kali |
| Melebihi kuota | Wajib persetujuan HRD atau Admin |
| Dicatat di audit log | Ya — siapa, kapan, nilai lama, nilai baru, alasan |

### 5.4 Jalur B — Koreksi anomali massal (insiden mesin)

Dipicu otomatis ketika: **jumlah karyawan dengan status `LENGKAP` pada suatu tanggal** turun di bawah **50%** dari rata-rata 7 hari kerja sebelumnya.

| Langkah | Ketentuan |
|---|---|
| Deteksi | Otomatis saat file diproses |
| Notifikasi | Sistem mengirim peringatan ke Admin dan HRD |
| Prinsip dasar | Karyawan tidak dirugikan atas kegagalan alat perusahaan |
| Ada bukti parsial (scan masuk ATAU pulang) | Dianggap hadir penuh (1 hari) |
| Tidak ada bukti sama sekali | Verifikasi dari sumber sekunder (catatan mandor, dll.) |
| Sumber sekunder tidak ada | Keputusan manajemen — per tanggal, bukan per orang |
| Lembur pada tanggal insiden | Wajib verifikasi manual (tidak otomatis) |
| Semua keputusan tercatat | Ya — siapa, kapan, dasar keputusan |

### 5.5 Perhitungan lembur

| Parameter | Ketentuan |
|---|---|
| Ambang minimum | Jam pulang ≥ 18:30 |
| Mulai hitung | Pukul 19:00 |
| Rumus durasi | Jam pulang − 19:00 |
| Pembulatan | Ke bawah, kelipatan 15 menit (konfigurabel) |
| Maksimum per hari | 4 jam (konfigurabel) — lebih dari ini wajib alasan |
| Wajib approval | Ya — oleh atasan langsung |
| Status sebelum approval | `PENDING_APPROVAL` — belum masuk perhitungan gaji |
| Status setelah approval | `APPROVED` — masuk perhitungan gaji |
| Status ditolak | `REJECTED` — tidak masuk perhitungan |

### 5.6 Perhitungan rupiah

**Catatan penting:** aturan di bawah ini adalah struktur awal. Tarif, komponen, dan rumus wajib diverifikasi ke HR/konsultan ketenagakerjaan sebelum dipakai untuk pembayaran aktual.

| Komponen | Rumus |
|---|---|
| Gaji pokok harian | Total gaji bulanan ÷ jumlah hari kerja per bulan |
| Upah lembur per jam | (Gaji bulanan ÷ 173) — sesuai PP 35/2021, wajib diverifikasi |
| Lembur jam pertama | Upah lembur per jam × 1,5 |
| Lembur jam ke-2 dst. | Upah lembur per jam × 2,0 |
| Total lembur per hari | (Jam-1 × 1,5 + Jam-sisa × 2,0) × upah lembur per jam |
| Total gaji bulan | (Hari kerja × gaji harian) + total lembur bulan |

**Yang BELUM termasuk dan perlu diputuskan:**

- Tunjangan tetap dan tidak tetap
- Potongan BPJS Ketenagakerjaan dan Kesehatan
- Potongan kasbon / pinjaman karyawan
- PPh 21
- Perbedaan tarif lembur hari biasa vs hari libur
- Upah hari libur nasional yang jatuh pada hari kerja

### 5.7 Tutup periode

| Aturan | Ketentuan |
|---|---|
| Siapa yang boleh | Admin atau HRD |
| Prasyarat | Semua hari-orang berstatus `LENGKAP` atau sudah dikoreksi |
| Prasyarat lembur | Semua lembur berstatus `APPROVED` atau `REJECTED` |
| Efek | Semua data bulan tersebut dikunci — tidak bisa diubah |
| Pembukaan kunci | Hanya Admin, wajib PIN + alasan, tercatat di audit log |
| Rollback | Tidak ada — pembukaan kunci membuat periode bisa diedit, lalu ditutup lagi |

---

## 6. Kebutuhan Fungsional

### F01 — Master karyawan

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F01.1 | Tambah, ubah, dan nonaktifkan data karyawan | P0 |
| F01.2 | Menyimpan: UID mesin, nama, jabatan, tanggal masuk, tanggal keluar, status aktif/nonaktif | P0 |
| F01.3 | Menyimpan tarif: gaji bulanan, tunjangan, komponen gaji lain | P1 |
| F01.4 | Mapping UID mesin ke karyawan (satu karyawan bisa punya >1 UID jika diganti kartu) | P0 |
| F01.5 | Riwayat perubahan tarif (effective date) | P1 |
| F01.6 | Karyawan nonaktif tidak muncul di rekap bulan berjalan | P0 |

### F02 — Import data mesin absen

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F02.1 | Upload file Excel (.xlsx) dari mesin absen | P0 |
| F02.2 | Validasi format file: kolom yang diharapkan, tipe data | P0 |
| F02.3 | Pencegahan double import: tolak jika data tanggal yang sama sudah pernah diimpor | P0 |
| F02.4 | Preview sebelum commit: tampilkan ringkasan (jumlah baris, rentang tanggal, UID tidak dikenal) | P0 |
| F02.5 | Data mentah disimpan apa adanya (immutable) — tidak pernah diubah setelah import | P0 |
| F02.6 | Deteksi UID yang tidak ada di master karyawan | P0 |
| F02.7 | Log import: siapa, kapan, nama file, jumlah baris, status | P0 |

### F03 — Mesin perhitungan kehadiran

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F03.1 | Deduplikasi scan (jendela konfigurabel, default 3 menit) | P0 |
| F03.2 | Klasifikasi scan ke jendela: MASUK, ISTIRAHAT, PULANG | P0 |
| F03.3 | Penetapan status per hari per karyawan sesuai aturan 5.2 | P0 |
| F03.4 | Deteksi anomali massal per tanggal sesuai aturan 5.4 | P0 |
| F03.5 | Perhitungan jam lembur sesuai aturan 5.5 | P0 |
| F03.6 | Seluruh logika berjalan di server (Supabase RPC), bukan di frontend | P0 |
| F03.7 | Parameter jendela dan ambang diambil dari tabel konfigurasi | P0 |

### F04 — Koreksi kehadiran

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F04.1 | Daftar hari-orang yang perlu koreksi, dikelompokkan per tanggal | P0 |
| F04.2 | Form koreksi: jam masuk, jam pulang, alasan (wajib) | P0 |
| F04.3 | Validasi kuota koreksi per karyawan per bulan | P0 |
| F04.4 | Koreksi massal untuk tanggal insiden (Jalur B) | P1 |
| F04.5 | Status koreksi: PENDING, APPROVED, REJECTED | P1 |
| F04.6 | Audit trail setiap koreksi | P0 |

### F05 — Approval lembur

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F05.1 | Daftar lembur pending approval | P0 |
| F05.2 | Approve/reject per orang per hari | P0 |
| F05.3 | Approve/reject massal per tanggal | P1 |
| F05.4 | Catatan/alasan saat reject (wajib) | P0 |
| F05.5 | Lembur yang belum di-approve tidak masuk perhitungan gaji | P0 |

### F06 — Perhitungan gaji

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F06.1 | Hitung gaji pokok berdasarkan jumlah hari kerja × tarif harian | P0 |
| F06.2 | Hitung lembur berdasarkan jam yang di-approve × tarif lembur | P0 |
| F06.3 | Total gaji = pokok + lembur + tunjangan − potongan | P1 |
| F06.4 | Simulasi gaji sebelum tutup periode (draft, bisa berubah) | P1 |
| F06.5 | Rekap gaji final setelah tutup periode | P0 |

### F07 — Tutup periode

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F07.1 | Validasi prasyarat sebelum tutup (semua status resolved) | P0 |
| F07.2 | Kunci seluruh data bulan tersebut | P0 |
| F07.3 | Pembukaan kunci darurat (Admin + PIN + alasan) | P1 |
| F07.4 | Riwayat tutup/buka periode | P0 |

### F08 — Laporan & ekspor

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F08.1 | Rekap bulanan per karyawan (hari kerja, jam lembur, gaji) | P0 |
| F08.2 | Rekap per tanggal (jumlah hadir, anomali, lembur) | P0 |
| F08.3 | Ekspor ke Excel (.xlsx) | P0 |
| F08.4 | Daftar anomali yang belum dikoreksi | P0 |
| F08.5 | Laporan audit trail | P1 |

### F09 — Kalender kerja

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F09.1 | Definisi hari kerja per bulan (Senin–Sabtu default) | P0 |
| F09.2 | Tandai hari libur nasional | P0 |
| F09.3 | Tandai hari libur perusahaan | P1 |
| F09.4 | Jumlah hari kerja per bulan dihitung otomatis dari kalender | P0 |

### F10 — Konfigurasi

| ID | Kebutuhan | Prioritas |
|---|---|---|
| F10.1 | Parameter jendela waktu (masuk, istirahat, pulang) | P0 |
| F10.2 | Parameter lembur (ambang, mulai hitung, pembulatan, maks) | P0 |
| F10.3 | Ambang deteksi anomali massal (persentase) | P0 |
| F10.4 | Kuota koreksi per karyawan per bulan | P0 |
| F10.5 | Tarif dasar lembur (pembagi 173, pengali 1.5/2.0) | P1 |
| F10.6 | Riwayat perubahan konfigurasi | P1 |

---

## 7. Kebutuhan Non-Fungsional

### Performa

| Parameter | Target |
|---|---|
| Waktu import 5.000 baris | < 10 detik |
| Waktu hitung rekap bulanan 100 karyawan | < 5 detik |
| Waktu buka halaman dashboard | < 2 detik |
| Waktu ekspor Excel 100 karyawan × 30 hari | < 15 detik |

### Ketersediaan

| Parameter | Target |
|---|---|
| Uptime | 99% (downtime maks ±7 jam/bulan) |
| Backup database | Otomatis harian oleh Supabase |
| Recovery point objective (RPO) | 24 jam |

### Kapasitas

| Parameter | Batas desain |
|---|---|
| Karyawan aktif | Hingga 500 |
| Data scan per bulan | Hingga 50.000 baris |
| Riwayat tersimpan | Minimal 24 bulan |
| Ukuran file upload | Maks 10 MB |

### Kompatibilitas

| Platform | Browser minimum |
|---|---|
| Desktop | Chrome 90+, Edge 90+, Firefox 90+ |
| Mobile (prioritas) | Chrome Android, Safari iOS 15+ |
| Tablet | Sama dengan mobile |

---

## 8. Arsitektur & Teknologi

### Stack teknologi

| Lapisan | Teknologi | Alasan |
|---|---|---|
| Frontend | HTML/CSS/JS (vanilla) atau React | Sudah familiar, deployment mudah |
| Hosting | Netlify | Gratis untuk skala ini, drag-and-drop deploy |
| Database | Supabase (PostgreSQL) | RLS, Auth, Realtime, free tier cukup |
| Logika bisnis | Supabase RPC (SECURITY DEFINER) | Server-side enforcement |
| Auth | Supabase Auth (email + password) | Sudah terintegrasi dengan RLS |
| Ekspor Excel | ExcelJS via Netlify Function | Server-side, tidak membebani browser |
| Notifikasi | Fonnte / Wablas (WhatsApp) | Untuk peringatan anomali — opsional |

### Prinsip arsitektur

1. **Data mentah immutable** — scan dari mesin tidak pernah diubah setelah import
2. **Semua aturan bisnis di server** — frontend hanya untuk tampilan dan input
3. **RLS aktif di semua tabel** — akses data sesuai role
4. **Konfigurasi di database** — tidak ada hardcode untuk parameter bisnis
5. **Audit trail otomatis** — setiap perubahan tercatat via trigger

---

## 9. Desain Database

### Diagram relasi (konseptual)

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  karyawan    │     │  scan_mentah     │     │  absensi_harian  │
│─────────────│     │──────────────────│     │──────────────────│
│ id           │◄────│ karyawan_id      │     │ karyawan_id      │
│ uid_mesin[]  │     │ timestamp_scan   │     │ tanggal          │
│ nama         │     │ data_mentah      │     │ jam_masuk         │
│ jabatan      │     │ import_id        │     │ jam_pulang        │
│ gaji_bulanan │     │ created_at       │     │ status           │
│ tgl_masuk    │     └──────────────────┘     │ jam_lembur       │
│ tgl_keluar   │                               │ status_lembur   │
│ status_aktif │     ┌──────────────────┐     │ sumber           │
└─────────────┘     │  koreksi_log     │     │ is_insiden       │
                     │──────────────────│     └──────────────────┘
┌─────────────┐     │ absensi_id       │
│  konfigurasi │     │ field_diubah     │     ┌──────────────────┐
│─────────────│     │ nilai_lama       │     │  gaji_bulanan    │
│ key          │     │ nilai_baru       │     │──────────────────│
│ value        │     │ alasan           │     │ karyawan_id      │
│ updated_by   │     │ dikoreksi_oleh   │     │ periode          │
│ updated_at   │     │ created_at       │     │ hari_kerja       │
└─────────────┘     └──────────────────┘     │ jam_lembur_total │
                                               │ gaji_pokok       │
┌─────────────┐     ┌──────────────────┐     │ gaji_lembur      │
│  kalender    │     │  import_log      │     │ tunjangan        │
│─────────────│     │──────────────────│     │ potongan         │
│ tanggal      │     │ nama_file        │     │ total_gaji       │
│ jenis_hari   │     │ jumlah_baris     │     │ status           │
│ keterangan   │     │ rentang_tanggal  │     └──────────────────┘
└─────────────┘     │ uid_tidak_dikenal│
                     │ diimport_oleh    │     ┌──────────────────┐
                     │ created_at       │     │  periode_gaji    │
                     └──────────────────┘     │──────────────────│
                                               │ bulan            │
┌─────────────┐                               │ tahun            │
│  audit_log   │                               │ status (buka/    │
│─────────────│                               │         tutup)   │
│ actor_id     │                               │ ditutup_oleh     │
│ action       │                               │ ditutup_at       │
│ entity       │                               └──────────────────┘
│ entity_id    │
│ old_value    │
│ new_value    │
│ created_at   │
└─────────────┘
```

### Catatan desain database

- **`scan_mentah`** menyimpan data verbatim dari file — tidak pernah di-UPDATE atau DELETE
- **`absensi_harian`** adalah hasil olahan dari scan_mentah — bisa di-UPDATE melalui koreksi
- **`koreksi_log`** mencatat setiap perubahan terhadap absensi_harian — immutable
- **`gaji_bulanan`** dihitung dari absensi_harian yang sudah final — hanya ditulis saat tutup periode
- **RLS:** `karyawan` dan `gaji_bulanan` mengandung data sensitif (gaji). Akses dibatasi ke Admin dan HRD
- **Soft delete:** karyawan tidak dihapus, hanya dinonaktifkan (`status_aktif = false`)
- Composite key `(karyawan_id, tanggal)` pada `absensi_harian` mencegah duplikasi

---

## 10. Antarmuka Pengguna

### Hierarki layar

```
Login
├── Dashboard
│   ├── Peringatan anomali hari ini
│   ├── Ringkasan bulan berjalan
│   └── Aksi cepat
├── Import Absensi
│   ├── Upload file
│   ├── Preview & validasi
│   └── Konfirmasi import
├── Rekap Harian ★ (layar utama)
│   ├── Filter: tanggal, status, karyawan
│   ├── Tabel rekap dengan status warna
│   ├── Aksi koreksi (inline/modal)
│   └── Aksi approval lembur
├── Koreksi Absensi
│   ├── Daftar perlu koreksi
│   ├── Form koreksi
│   └── Riwayat koreksi
├── Rekap Bulanan
│   ├── Per karyawan: hari, lembur, gaji
│   ├── Ekspor Excel
│   └── Tutup periode
├── Master Data
│   ├── Karyawan
│   ├── Kalender kerja
│   └── Konfigurasi
├── Laporan
│   ├── Rekap gaji
│   ├── Anomali
│   └── Audit trail
└── Pengaturan
    ├── Profil pengguna
    └── Kelola pengguna (Admin)
```

### Prinsip desain UI

| Prinsip | Penerapan |
|---|---|
| **Mobile-first** | Mandor mengakses dari smartphone di lapangan |
| **Status visual yang jelas** | Badge warna konsisten: hijau = lengkap, kuning = perlu koreksi, merah = ditolak/alpa |
| **Layar koreksi = layar terpenting** | Bukan dashboard. Ini tempat pekerjaan sebenarnya terjadi |
| **Konfirmasi untuk aksi berisiko** | Tutup periode, hapus data, koreksi massal |
| **Pesan error yang manusiawi** | "Data 30 Juni belum lengkap — scan terakhir pukul 14:42. Apakah file sudah diekspor ulang?" |
| **Angka yang bisa diklik** | Angka "5 perlu koreksi" bisa diklik langsung ke daftar yang relevan |

### Spesifikasi layar kritis

**Dashboard**
- KPI utama: total karyawan aktif, hari kerja bulan ini, total sudah dihitung vs perlu koreksi, total lembur pending
- Peringatan: tanggal hari ini anomali (jika ada), koreksi mendekati batas kuota
- Aksi cepat: upload file, buka koreksi, buka rekap

**Rekap Harian (layar utama)**
- Kalender bulan dengan indikator warna per tanggal (hijau = semua lengkap, kuning = ada koreksi, merah = insiden)
- Klik tanggal → tabel karyawan dengan kolom: nama, jam masuk, jam pulang, status, jam lembur, aksi
- Filter: status (semua / lengkap / perlu koreksi / insiden)
- Mobile: tampilan card list, bukan tabel

**Form Koreksi**
- Tampilkan data asli (read-only): scan mentah yang tercatat
- Input: jam masuk koreksi, jam pulang koreksi, dropdown alasan, catatan tambahan
- Validasi: alasan wajib, jam harus masuk akal (masuk < pulang, dll.)
- Tampilkan sisa kuota koreksi karyawan ini bulan ini

---

## 11. Keamanan

### Prinsip

| Prinsip | Penerapan |
|---|---|
| Least privilege | Setiap role hanya bisa mengakses data yang relevan |
| Defense in depth | Validasi di frontend + backend + database (RLS) |
| Audit everything | Setiap perubahan data tercatat |
| No secret in frontend | Service role key hanya di Netlify Function |
| Secure by default | RLS aktif, deny by default |

### Risiko spesifik & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Mandor mengubah jam absen timnya tanpa dasar | Kelebihan bayar | Kuota koreksi + alasan wajib + audit log |
| Orang tidak berwenang melihat data gaji | Kebocoran informasi sensitif | RLS: hanya Admin + HRD bisa query tabel gaji |
| Double import file yang sama | Data ganda, gaji ganda | Cek duplikasi berdasarkan hash file + rentang tanggal |
| Upload file berbahaya | Eksekusi kode | Validasi format + ekstensi + ukuran + parsing server-side |
| Session hijacking | Aksi atas nama orang lain | Supabase Auth + token expiry + HTTPS only |
| Manipulasi data setelah tutup periode | Data gaji berubah retroaktif | Flag locked + validasi di RPC + pembukaan darurat tercatat |

---

## 12. Integrasi

### Saat ini (MVP)

| Sistem | Metode | Arah | Keterangan |
|---|---|---|---|
| Mesin absen | Upload file manual (.xlsx) | Masuk | Satu-satunya sumber data scan |
| Excel | Ekspor .xlsx via ExcelJS | Keluar | Rekap gaji, rekap harian, laporan anomali |

### Masa depan (opsional)

| Sistem | Metode | Keterangan |
|---|---|---|
| WhatsApp (Fonnte/Wablas) | API | Peringatan anomali ke Admin |
| Mesin absen (API/FTP) | Terjadwal | Menggantikan upload manual |
| Sistem akuntansi | Ekspor jurnal | Integrasi dengan pembukuan |
| BPJS | Manual / ekspor | Perhitungan potongan |

---

## 13. Peta Jalan Implementasi

### Fase 0 — Validasi aturan (1–2 minggu)

**Tujuan:** memastikan aturan bisnis benar sebelum dikodekan.

| # | Aktivitas | Output |
|---|---|---|
| 1 | Bawa file audit ke HR/mandor | Koreksi 465 baris data Juni |
| 2 | Konfirmasi penyebab 14–20 Juni | Penyebab & pencegahan |
| 3 | Ekspor ulang data 30 Juni | Data lengkap |
| 4 | Tetapkan kebijakan Jalur A & B | Dokumen kebijakan |
| 5 | Siapkan master karyawan (UID → nama → tarif) | File master |
| 6 | Verifikasi rumus lembur ke HR/konsultan | Rumus tervalidasi |

**Kriteria lanjut:** kebijakan tertulis + master karyawan tersedia.

### Fase 1 — Fondasi (2–3 minggu)

| # | Modul | Fitur |
|---|---|---|
| 1 | Database | Tabel, RLS, RPC, trigger audit |
| 2 | Auth | Login, role, hak akses |
| 3 | Master karyawan | CRUD + mapping UID |
| 4 | Konfigurasi | Parameter jam kerja, lembur, ambang |
| 5 | Kalender kerja | Definisi hari kerja + libur |

### Fase 2 — Inti absensi (2–3 minggu)

| # | Modul | Fitur |
|---|---|---|
| 1 | Import | Upload, validasi, preview, commit |
| 2 | Mesin hitung | Deduplikasi, klasifikasi, status, deteksi anomali |
| 3 | Rekap harian | Tampilan kalender + tabel + filter |
| 4 | Koreksi | Form, kuota, audit trail |
| 5 | Approval lembur | Daftar, approve/reject, catatan |

### Fase 3 — Penggajian (1–2 minggu)

| # | Modul | Fitur |
|---|---|---|
| 1 | Tarif karyawan | Input gaji, tunjangan, riwayat |
| 2 | Perhitungan gaji | Pokok + lembur + tunjangan − potongan |
| 3 | Rekap bulanan | Per karyawan, simulasi, final |
| 4 | Tutup periode | Validasi, kunci, pembukaan darurat |
| 5 | Ekspor Excel | Rekap gaji, rekap harian, anomali |

### Fase 4 — Pematangan (1–2 minggu)

| # | Modul | Fitur |
|---|---|---|
| 1 | Dashboard | KPI, peringatan, aksi cepat |
| 2 | Laporan | Audit trail, tren kehadiran |
| 3 | Mobile optimization | Responsive, card view, touch-friendly |
| 4 | Testing | Skenario utama + edge case |
| 5 | Dokumentasi | Panduan pengguna |

**Total estimasi:** 6–10 minggu setelah Fase 0 selesai.

---

## 14. Kriteria Keberhasilan

### Kuantitatif

| Metrik | Target | Cara ukur |
|---|---|---|
| Waktu proses rekap bulanan | < 1 hari (dari ±3 hari manual) | Tanggal upload → tanggal tutup periode |
| Hari-orang salah hitung | 0 pada status LENGKAP | Audit sampling vs catatan mandor |
| Anomali mesin terdeteksi | 100% dalam hari yang sama | Alert dikirim pada hari import |
| Data gaji tanpa audit trail | 0 | Setiap baris gaji punya jejak koreksi |
| Akses data gaji oleh yang tidak berwenang | 0 insiden | RLS test + penetration test sederhana |

### Kualitatif

| Kriteria | Indikator |
|---|---|
| HR merasa lebih cepat | Proses yang dulu 3 hari bisa 1 hari |
| Mandor bisa mengoreksi sendiri | Tidak perlu telepon/WA ke HR untuk koreksi |
| Manajemen percaya angkanya | Tidak ada pertanyaan "ini hitungannya bener?" |
| Karyawan tidak komplain soal gaji | Berkurang vs bulan sebelumnya |
| Saat ada sengketa, bisa diselesaikan | Ada bukti: scan asli + koreksi + alasan + siapa |

---

## 15. Risiko & Mitigasi

| # | Risiko | Kemungkinan | Dampak | Mitigasi |
|---|---|---|---|---|
| R1 | Aturan lembur tidak sesuai regulasi | Sedang | Tinggi | Verifikasi ke konsultan ketenagakerjaan sebelum go-live |
| R2 | Mesin absen rusak lagi tanpa cadangan | Tinggi | Tinggi | Deteksi otomatis + ekspor harian + mesin cadangan |
| R3 | Master karyawan tidak lengkap/salah | Tinggi | Tinggi | Validasi bersama HR sebelum Fase 1 |
| R4 | Mandor tidak mau pakai sistem digital | Sedang | Sedang | Training + buat semudah mungkin + WhatsApp reminder |
| R5 | Free tier Supabase tidak cukup | Rendah | Rendah | 500 karyawan × 30 hari = 15.000 row/bulan — jauh di bawah limit |
| R6 | Perubahan kebijakan upah lembur | Rendah | Sedang | Semua tarif di tabel konfigurasi, bukan hardcode |
| R7 | Koreksi disalahgunakan (absensi fiktif) | Sedang | Tinggi | Kuota + alasan wajib + audit + sampling acak oleh HRD |
| R8 | Data gaji bocor | Rendah | Tinggi | RLS ketat + hanya Admin/HRD + HTTPS + no export tanpa log |

---

## 16. Glosarium

| Istilah | Definisi |
|---|---|
| **Scan** | Satu baris data dari mesin absen — satu kali tap kartu/sidik jari |
| **Hari-orang** | Satu pasangan (karyawan × tanggal) — unit dasar perhitungan |
| **Status LENGKAP** | Hari-orang yang punya scan masuk dan pulang yang valid |
| **Anomali individual** | Hari-orang yang tidak lengkap pada tanggal yang secara umum normal |
| **Anomali massal (insiden)** | Tanggal di mana mayoritas karyawan gagal terekam — indikasi kegagalan mesin |
| **Koreksi** | Tindakan manual oleh atasan untuk melengkapi data yang hilang |
| **Approval lembur** | Persetujuan atasan bahwa jam lembur yang tercatat memang benar |
| **Tutup periode** | Penguncian data bulan tertentu setelah semua koreksi selesai |
| **RLS** | Row Level Security — mekanisme database yang membatasi baris mana yang bisa diakses oleh siapa |
| **RPC** | Remote Procedure Call — fungsi di server yang dipanggil oleh frontend |
| **Tarif harian** | Gaji bulanan ÷ jumlah hari kerja bulan tersebut |
| **Upah lembur per jam** | Gaji bulanan ÷ 173 (sesuai PP 35/2021, perlu verifikasi) |
| **Jendela waktu** | Rentang jam yang digunakan untuk mengklasifikasikan scan sebagai masuk, istirahat, atau pulang |

---

## 17. Lampiran: Temuan Data Juni 2026

### A. Kronologi insiden mesin 14–20 Juni

| Tanggal | Hari | Scan pertama | Scan terakhir | Total scan | Karyawan aktif ter-scan | Diagnosis |
|---|---|---|---|---|---|---|
| 14 Jun | Minggu | 06:43 | 16:28 | 85 | 70 | Scan pagi normal, mati sore — hanya 13 LENGKAP |
| 15 Jun | Senin | 06:35 | 07:55 | 26 | 26 | Mesin berhenti total ±08:00. Tidak ada scan setelahnya |
| 16 Jun | Selasa | — | — | 0 | 0 | Mati total sepanjang hari |
| 17 Jun | Rabu | 07:07 | 21:32 | 99 | 77 | Pagi normal, mati siang–sore, sebagian malam terekam |
| 18 Jun | Kamis | 12:59 | 18:01 | 23 | 22 | Mati pagi, hidup sebentar siang |
| 19 Jun | Jumat | 12:38 | 23:04 | 66 | 50 | Mati pagi, hidup siang–sore–malam |
| 20 Jun | Sabtu | 12:11 | 13:16 | 30 | 28 | Hidup ±1 jam saja |

### B. Distribusi status kehadiran (seluruh Juni)

| Status | Jumlah hari-orang | Persentase |
|---|---|---|
| LENGKAP | 1.562 | 77,1% |
| TANPA PULANG | 304 | 15,0% |
| TANPA MASUK | 84 | 4,1% |
| HANYA SCAN TENGAH | 77 | 3,8% |
| **Total** | **2.027** | **100%** |

### C. Statistik lembur

| Parameter | Nilai |
|---|---|
| Total hari-orang dengan potensi lembur (pulang ≥ 18:30) | 113 |
| Yang pulang antara 18:30–19:00 (di bawah ambang hitung) | 27 |
| Total jam lembur (rumus: pulang − 19:00, clip ≥ 0) | 233,03 jam |
| Rata-rata jam lembur per kejadian | 2,0 jam |
| Maksimum jam lembur dalam satu hari | 4,08 jam |

### D. UID yang perlu investigasi

| UID | Karakteristik | Kemungkinan |
|---|---|---|
| SAIFUL | Teks, bukan angka (33 scan) | Mesin mengirim nama — mapping manual ke UID |
| UID 23 | 21 hari, selalu 1 scan ±18:00 | Shift berbeda atau mesin absen terpisah |
| 9 UID (1 hari) | Masing-masing hanya hadir 1 hari | Karyawan harian, salah enroll, atau percobaan |
| 3 UID (2 hari) | Masing-masing hanya hadir 2 hari | Perlu konfirmasi status ke HR |

---

*Dokumen ini adalah draft yang memerlukan validasi. Semua parameter bisnis (jendela waktu, kuota koreksi, tarif lembur, ambang insiden) adalah usulan awal yang wajib disetujui oleh pemilik kebijakan sebelum diimplementasikan.*

*Disusun berdasarkan analisis file jun1.xlsx (ekspor mesin absen Juni 2026, 4.602 baris, 121 UID).*
