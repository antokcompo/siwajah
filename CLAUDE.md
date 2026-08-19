# SI WAJAH — Sistem Informasi Web Absensi dan Aktifitas Harian

## Project Overview

Aplikasi web internal untuk **PT PP (Persero)** yang mengelola absensi dan penggajian harian pekerja konstruksi. Data absensi diimpor dari file Excel ekspor mesin fingerprint, lalu diproses otomatis menjadi rekap harian, perhitungan lembur, dan slip gaji bulanan.

**Bahasa UI**: Indonesia (semua label, pesan, variabel tabel menggunakan Bahasa Indonesia).

## Tech Stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3
- **Backend**: Supabase (PostgreSQL + Auth + RLS + RPC)
- **UI icons**: lucide-react
- **Excel parsing**: SheetJS (xlsx)
- **PDF export**: jsPDF + jspdf-autotable
- **Routing**: react-router-dom v6

## Quick Start

```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run dev             # http://localhost:3000
```

## Project Structure

```
├── index.html                    # SPA entry point
├── src/
│   ├── main.jsx                  # React root (BrowserRouter + AuthProvider)
│   ├── App.jsx                   # Route definitions
│   ├── index.css                 # Global CSS: design tokens, glassmorphism dark theme, component classes
│   ├── lib/
│   │   └── supabase.js           # Supabase client init
│   ├── contexts/
│   │   └── AuthContext.jsx       # Auth state (user, profile, signIn, signOut)
│   ├── components/
│   │   ├── Layout.jsx            # App shell: sidebar nav, topbar, change-password modal
│   │   └── ProtectedRoute.jsx    # Role-based route guard
│   └── pages/
│       ├── Login.jsx             # Email/password login
│       ├── Dashboard.jsx         # KPI cards + trend charts (Recharts via CDN-free SVG)
│       ├── ImportAbsensi.jsx     # Upload Excel → parse → preview table → RPC import
│       ├── RekapHarian.jsx       # Daily attendance summary table
│       ├── Koreksi.jsx           # Fix anomalous attendance records
│       ├── ApprovalLembur.jsx    # Approve/reject overtime (grouped by mandor)
│       ├── RekapBulanan.jsx      # Monthly salary recap + PDF slip generation
│       ├── MasterKaryawan.jsx    # Employee CRUD + Excel import
│       ├── KalenderKerja.jsx     # Work calendar (kerja/libur per day)
│       ├── ManajemenUser.jsx     # User account management (admin only)
│       ├── Konfigurasi.jsx       # System config parameters
│       └── AuditLog.jsx          # Change history log viewer
├── public/
│   ├── logo-pp.png               # Full company logo
│   └── logo-pp-icon.png          # Icon-only logo (sidebar, favicon)
├── supabase/
│   ├── migrations/               # Sequential SQL migrations (001-017)
│   │   ├── 001_create_tables.sql # All tables, indexes, RLS policies, audit trigger
│   │   ├── 002_rpc_karyawan.sql  # Employee CRUD RPCs
│   │   ├── 003_rpc_kalender.sql  # Calendar RPCs
│   │   ├── 004_rpc_rekap_harian.sql # Daily recap RPC
│   │   ├── 005_fix_timezone.sql  # Timezone handling fixes
│   │   ├── 006_cleanup_reimport.sql # Cleanup + reimport RPC
│   │   ├── 007_full_salary_rule.sql # Salary calculation RPC
│   │   ├── 008_rpc_konfigurasi.sql # Config get/save RPCs
│   │   ├── 009_ensure_profile_and_fix_konfig.sql
│   │   ├── 010_fix_hitung_gaji.sql # Salary calc fixes
│   │   ├── 011_fix_timestamp_timezone.sql # Import timestamp fix + full import RPC
│   │   ├── 012_fix_prorata_hari_masuk.sql # Pro-rata salary fix
│   │   ├── 013_atasan_mandor.sql # Supervisor/mandor relations
│   │   ├── 014_status_approved.sql # Overtime approval RPC
│   │   ├── 015_user_management.sql # User management RPCs
│   │   ├── 016_create_user_and_password.sql # User creation + password change RPCs
│   │   └── 017_audit_batch_import.sql # Batch audit for imports
│   └── seed/
│       └── 001_default_config.sql # Default configuration values
└── .claude/
    └── launch.json               # Dev server config for Claude Code preview
```

## Database Schema (Supabase / PostgreSQL)

All tables use prefix `absen_`:

| Table | Purpose |
|-------|---------|
| `absen_user_profiles` | User accounts (linked to Supabase Auth) |
| `absen_karyawan` | Employees (pekerja harian) |
| `absen_konfigurasi` | System config key-value pairs |
| `absen_kalender` | Work calendar (kerja/libur per date) |
| `absen_import_log` | Import history |
| `absen_scan_mentah` | Raw scan data (immutable) |
| `absen_harian` | Daily attendance (computed from scans) |
| `absen_koreksi_log` | Correction history |
| `absen_periode_gaji` | Salary period open/close state |
| `absen_gaji_bulanan` | Monthly salary calculations |
| `absen_audit_log` | Audit trail for all data changes |

### Key RPC Functions

| Function | Purpose |
|----------|---------|
| `absen_import_dan_proses(p_scans, p_nama_file)` | Main import: parse scans → attendance → overtime → anomaly detection. Creates single IMPORT audit entry. |
| `absen_import_karyawan(p_data)` | Batch employee import from Excel |
| `absen_hitung_gaji_bulanan(p_bulan, p_tahun)` | Calculate monthly salary for all employees |
| `absen_approve_lembur(p_absensi_id, p_status, p_catatan)` | Approve/reject overtime |
| `absen_koreksi_absensi(p_absensi_id, p_jam_masuk, p_jam_pulang, p_alasan)` | Correct attendance record |
| `absen_get_konfigurasi()` / `absen_save_konfigurasi(p_data)` | Read/write system config |
| `absen_create_user_account(...)` / `absen_change_own_password(...)` | User management |

### Triggers

- `absen_audit_trigger_fn()` — FOR EACH ROW on `absen_harian`, `absen_karyawan`, `absen_konfigurasi`, `absen_periode_gaji`, `absen_gaji_bulanan`. Skips per-row audit on `absen_harian` when `import_id IS NOT NULL` (batch import creates a single IMPORT entry instead).
- `absen_set_updated_at()` — Auto-updates `updated_at` timestamp.

## Design System

### Theme

Glassmorphism dark theme with CSS custom properties defined in `src/index.css`:

- Background: deep navy (`#0a0e1a` → `#0f172a` gradient)
- Cards: frosted glass (`rgba(15, 23, 42, 0.6)` + `backdrop-filter: blur`)
- Accent: cyan-blue gradient for headers, active states
- All colors defined as CSS variables (`--bg-primary`, `--card-bg`, `--text-primary`, etc.)

### CSS Architecture

`src/index.css` (~730 lines) contains:

1. **CSS variables** — design tokens for colors, spacing, borders
2. **Base reset** — body, scrollbars, inputs
3. **Component classes** — `.card`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-danger`, `.badge`, `.input-field`, `.select-field`, `.modal-overlay`, `.modal-content`, `.table-header`, `.table-scroll`, `.table-group-header`, `.table-group-subtotal`, `.page-header`, `.page-title`, `.kpi-card`
4. **Layout classes** — `.app-shell`, `.sidebar-*`, `.main-area`, `.mobile-topbar`
5. **Dark theme overrides** — Tailwind utility classes (`text-gray-*`, `bg-*-50`, `text-emerald-700`, etc.) overridden with `!important` to work on dark backgrounds
6. **Animations** — `fade-in`, `pulse-ring`, `sidebar-slide-in`, `float`, `glow-pulse`

### Important CSS Convention

Since the app uses a **dark theme** but Tailwind defaults to light colors, many Tailwind utility classes are overridden in `index.css` with `!important`. When adding new colored elements:

- Prefer explicit dark-compatible colors: `text-slate-200`, `text-cyan-400`, `bg-white/5`
- For colored badges/alerts, use semi-transparent backgrounds: `bg-emerald-500/10`, `bg-red-500/10`
- Check if the Tailwind class has an override in `index.css` before using it

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full access to all features |
| `atasan` (supervisor/mandor) | Import, rekap, koreksi, approval lembur |
| `hrd` | Import, rekap, master karyawan, rekap bulanan |
| `manajemen` | Read-only: dashboard, rekap, audit log |

## Development Notes

### Running Migrations

Migrations are NOT auto-applied. Run each SQL file manually in **Supabase SQL Editor** in sequential order (001 → 017). Later migrations may `CREATE OR REPLACE` functions from earlier ones.

### Import Flow (Absensi)

1. User uploads `.xlsx` file (machine export: col A = UID, col B = timestamp)
2. Frontend parses with SheetJS, shows preview table (50 rows)
3. On confirm, calls `absen_import_dan_proses` RPC with all scan rows
4. RPC: inserts raw scans → resolves UID → dedup → computes attendance per employee/date → overtime calc → TIDAK_ADA_SCAN for absent employees → anomaly detection → single batch audit entry

### Import Flow (Karyawan)

1. User uploads `.xlsx` file (Sheet "JUN": col D=Nama, E=UID, F=Mandor, G=Jabatan)
2. Frontend parses, shows preview table with existing-UID highlighting
3. On confirm, calls `absen_import_karyawan` RPC

### Currency Formatting

Money inputs (Gaji Bulanan, Tunjangan) use formatted text inputs with `Rp` prefix and thousand separators (Indonesian format: `Rp 10.000.000`). The raw numeric value is stored without formatting. Helper functions `fmtRupiah()` / `parseRupiah()` in `MasterKaryawan.jsx`.

### Salary Calculation

Handled by `absen_hitung_gaji_bulanan` RPC. Key rules:
- Pro-rata based on `tgl_masuk` (join date)
- Overtime pay = `jam_lembur × (gaji_bulanan / hari_kerja_bulan / 8) × 1.5`
- Only APPROVED overtime counts
- Deductions for TIDAK_ADA_SCAN, TANPA_MASUK, TANPA_PULANG days

### PDF Slip Generation

`RekapBulanan.jsx` generates PDF salary slips client-side using jsPDF + jspdf-autotable. Includes company header, employee details, attendance summary, earnings breakdown.
