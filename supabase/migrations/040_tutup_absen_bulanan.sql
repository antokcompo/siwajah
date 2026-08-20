-- ============================================================
-- 040: Fitur Tutup Absen Bulanan & Approval Buka Lock (2 Hari Access Window)
--
-- Deskripsi:
--   - Tabel absen_tutup_bulan menyimpan status lock per bulan.
--   - Status: 'CLOSED', 'REQUESTED', 'UNLOCKED_TEMPORARY'.
--   - Jika diapprove oleh role 'manajemen', status menjadi 'UNLOCKED_TEMPORARY'
--     selama 2 HARI (48 Jam). Setelah 48 jam, otomatis kembali terkunci.
--   - Fungsi helper absen_is_bulan_closed(p_tanggal) memvalidasi status lock.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- Drop old table & foreign key constraints to ensure clean migration
DROP TABLE IF EXISTS absen_tutup_bulan CASCADE;

CREATE TABLE absen_tutup_bulan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun integer NOT NULL,
  bulan integer NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('CLOSED', 'REQUESTED', 'UNLOCKED_TEMPORARY')),
  closed_at timestamptz DEFAULT now(),
  closed_by uuid,
  request_by uuid,
  request_at timestamptz,
  alasan_request text,
  approved_by uuid,
  approved_at timestamptz,
  unlocked_until timestamptz,
  catatan_approval text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_tutup_bulan UNIQUE (tahun, bulan)
);

CREATE INDEX idx_tutup_bulan_lookup ON absen_tutup_bulan (tahun, bulan);

-- Fungsi Helper: Memeriksa apakah suatu tanggal berada pada bulan yang DITUTUP
CREATE OR REPLACE FUNCTION absen_is_bulan_closed(p_tanggal date)
RETURNS boolean AS $$
DECLARE
  v_tahun integer;
  v_bulan integer;
  v_rec record;
BEGIN
  v_tahun := EXTRACT(YEAR FROM p_tanggal)::integer;
  v_bulan := EXTRACT(MONTH FROM p_tanggal)::integer;

  SELECT * INTO v_rec FROM absen_tutup_bulan WHERE tahun = v_tahun AND bulan = v_bulan;

  IF v_rec IS NULL THEN
    RETURN false;
  END IF;

  IF v_rec.status = 'UNLOCKED_TEMPORARY' THEN
    IF v_rec.unlocked_until IS NOT NULL AND now() <= v_rec.unlocked_until THEN
      RETURN false;
    ELSE
      RETURN true;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Tutup Absen Bulan tertentu
CREATE OR REPLACE FUNCTION absen_lock_bulan(
  p_tahun integer,
  p_bulan integer,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_valid_user uuid := NULL;
BEGIN
  IF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM absen_karyawan WHERE id = p_user_id) THEN
    v_valid_user := p_user_id;
  END IF;

  INSERT INTO absen_tutup_bulan (tahun, bulan, status, closed_at, closed_by, updated_at)
  VALUES (p_tahun, p_bulan, 'CLOSED', now(), v_valid_user, now())
  ON CONFLICT (tahun, bulan) DO UPDATE SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by = COALESCE(v_valid_user, absen_tutup_bulan.closed_by),
    unlocked_until = NULL,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Absen bulan berhasil ditutup.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Pengajuan Permintaan Buka Lock Tutup Absen
CREATE OR REPLACE FUNCTION absen_request_buka_tutup_bulan(
  p_tahun integer,
  p_bulan integer,
  p_alasan text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_valid_user uuid := NULL;
BEGIN
  IF p_alasan IS NULL OR trim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan pembukaan lock wajib diisi';
  END IF;

  IF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM absen_karyawan WHERE id = p_user_id) THEN
    v_valid_user := p_user_id;
  END IF;

  INSERT INTO absen_tutup_bulan (tahun, bulan, status, request_by, request_at, alasan_request, updated_at)
  VALUES (p_tahun, p_bulan, 'REQUESTED', v_valid_user, now(), p_alasan, now())
  ON CONFLICT (tahun, bulan) DO UPDATE SET
    status = 'REQUESTED',
    request_by = COALESCE(v_valid_user, absen_tutup_bulan.request_by),
    request_at = now(),
    alasan_request = p_alasan,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Permintaan buka lock berhasil dikirim ke Manajemen.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Approval / Reject Permintaan Buka Lock (Oleh Role Management)
CREATE OR REPLACE FUNCTION absen_approve_buka_tutup_bulan(
  p_tahun integer,
  p_bulan integer,
  p_action text,
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_unlocked_until timestamptz;
  v_valid_user uuid := NULL;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Aksi harus APPROVE atau REJECT';
  END IF;

  IF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM absen_karyawan WHERE id = p_user_id) THEN
    v_valid_user := p_user_id;
  END IF;

  IF p_action = 'APPROVE' THEN
    v_unlocked_until := now() + interval '2 days';

    UPDATE absen_tutup_bulan
    SET status = 'UNLOCKED_TEMPORARY',
        approved_by = v_valid_user,
        approved_at = now(),
        unlocked_until = v_unlocked_until,
        catatan_approval = p_catatan,
        updated_at = now()
    WHERE tahun = p_tahun AND bulan = p_bulan;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'UNLOCKED_TEMPORARY',
      'unlocked_until', v_unlocked_until,
      'message', 'Permintaan disetujui. Akses edit terbuka selama 2 hari (hingga ' || to_char(v_unlocked_until, 'YYYY-MM-DD HH24:MI') || ').'
    );
  ELSE
    UPDATE absen_tutup_bulan
    SET status = 'CLOSED',
        approved_by = v_valid_user,
        approved_at = now(),
        catatan_approval = p_catatan,
        unlocked_until = NULL,
        updated_at = now()
    WHERE tahun = p_tahun AND bulan = p_bulan;

    RETURN jsonb_build_object('success', true, 'status', 'CLOSED', 'message', 'Permintaan buka lock ditolak.');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
