# SI WAJAH

**Sistem Informasi Web Absensi dan Aktifitas Harian**

Aplikasi web internal untuk mengelola absensi dan penggajian harian pekerja konstruksi PT PP (Persero). Data absensi diimpor dari file Excel ekspor mesin fingerprint, lalu diproses otomatis menjadi rekap harian, perhitungan lembur, dan slip gaji bulanan.

## Fitur Utama

- **Import Absensi** — Upload file ekspor mesin absen (.xlsx), preview data, proses otomatis
- **Rekap Harian** — Ringkasan kehadiran per hari (masuk/pulang/lembur/anomali)
- **Koreksi Absensi** — Perbaiki data absensi yang tidak lengkap (lupa scan, mesin error)
- **Approval Lembur** — Persetujuan jam lembur oleh atasan/mandor
- **Rekap Bulanan & Slip Gaji** — Perhitungan gaji otomatis + cetak slip PDF
- **Master Karyawan** — Kelola data pekerja + import dari Excel
- **Kalender Kerja** — Atur hari kerja/libur nasional/libur perusahaan
- **Manajemen User** — Kelola akun pengguna dengan role-based access
- **Konfigurasi** — Parameter sistem (jendela waktu, lembur, anomali)
- **Audit Log** — Riwayat perubahan data dengan detail lengkap
- **Dashboard** — KPI cards + trend chart gaji, kehadiran, lembur

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Icons | lucide-react |
| Excel | SheetJS (xlsx) |
| PDF | jsPDF + jspdf-autotable |

## Setup

### Prerequisites

- Node.js 18+
- Supabase project (free tier cukup)

### Installation

```bash
git clone https://github.com/<your-org>/FaceRegMon.git
cd FaceRegMon
npm install
```

### Environment

```bash
cp .env.example .env
```

Isi file `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Database Setup

Jalankan file SQL di **Supabase SQL Editor** secara berurutan:

```
supabase/migrations/001_create_tables.sql
supabase/migrations/002_rpc_karyawan.sql
supabase/migrations/003_rpc_kalender.sql
...
supabase/migrations/017_audit_batch_import.sql
supabase/seed/001_default_config.sql
```

### Run

```bash
npm run dev       # Development → http://localhost:3000
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

## User Roles

| Role | Akses |
|------|-------|
| `admin` | Semua fitur |
| `atasan` | Import, rekap, koreksi, approval lembur |
| `hrd` | Import, rekap, master karyawan, rekap bulanan |
| `manajemen` | Dashboard, rekap harian, rekap bulanan, audit log (read-only) |

## Project Structure

```
src/
├── main.jsx                 # Entry point
├── App.jsx                  # Routing
├── index.css                # Design system (dark theme, components)
├── lib/supabase.js          # Supabase client
├── contexts/AuthContext.jsx # Auth provider
├── components/
│   ├── Layout.jsx           # App shell + sidebar
│   └── ProtectedRoute.jsx   # Route guard
└── pages/                   # 11 page components

supabase/
├── migrations/              # 17 sequential SQL migrations
└── seed/                    # Default config values
```

## Screenshots

> _Tambahkan screenshot aplikasi di sini._

## License

Internal use only — PT PP (Persero).
