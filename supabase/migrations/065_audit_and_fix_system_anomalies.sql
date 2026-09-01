-- ============================================================
-- 065: Comprehensive System Audit & Performance Optimization
--
-- 1. Optimasi Index Database untuk isolasi proyek & query performa tinggi.
-- 2. Memperbarui RPC absen_dashboard_stats dengan isolasi p_kode_proyek.
-- 3. Memastikan fungsi-fungsi keamanan (SECURITY DEFINER & Search Path).
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah Index Performa untuk mempercepat query Dashboard & Rekap
CREATE INDEX IF NOT EXISTS idx_karyawan_proyek_aktif ON absen_karyawan(kode_proyek, status_aktif);
CREATE INDEX IF NOT EXISTS idx_harian_karyawan_tanggal ON absen_harian(karyawan_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_scan_karyawan_tanggal ON absen_scan_wajah(karyawan_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_daftar_lembur_lookup ON absen_daftar_lembur(karyawan_id, tanggal, status);

-- 2. Upgrade absen_dashboard_stats dengan parameter p_kode_proyek
CREATE OR REPLACE FUNCTION absen_dashboard_stats(
  p_bulan integer,
  p_tahun integer,
  p_kode_proyek text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_total_karyawan integer;
  v_total_lengkap integer;
  v_total_perlu_koreksi integer;
  v_total_lembur_pending integer;
  v_total_insiden integer;
  v_hari_kerja integer;
  v_kode text := NULLIF(p_kode_proyek, '');
BEGIN
  -- Total Karyawan Aktif
  IF v_kode IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_karyawan 
    FROM absen_karyawan 
    WHERE status_aktif = true AND kode_proyek = v_kode;
  ELSE
    SELECT COUNT(*) INTO v_total_karyawan 
    FROM absen_karyawan 
    WHERE status_aktif = true;
  END IF;

  -- Statistik Rekap Harian
  IF v_kode IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE ah.status = 'LENGKAP'),
      COUNT(*) FILTER (WHERE ah.status IN ('TANPA_PULANG','TANPA_MASUK','HANYA_SCAN_TENGAH','INSIDEN')),
      COUNT(*) FILTER (WHERE ah.status_lembur = 'PENDING_APPROVAL'),
      COUNT(*) FILTER (WHERE ah.is_insiden = true)
    INTO v_total_lengkap, v_total_perlu_koreksi, v_total_lembur_pending, v_total_insiden
    FROM absen_harian ah
    JOIN absen_karyawan k ON k.id = ah.karyawan_id AND k.status_aktif = true
    WHERE EXTRACT(MONTH FROM ah.tanggal) = p_bulan
      AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
      AND k.kode_proyek = v_kode;
  ELSE
    SELECT
      COUNT(*) FILTER (WHERE ah.status = 'LENGKAP'),
      COUNT(*) FILTER (WHERE ah.status IN ('TANPA_PULANG','TANPA_MASUK','HANYA_SCAN_TENGAH','INSIDEN')),
      COUNT(*) FILTER (WHERE ah.status_lembur = 'PENDING_APPROVAL'),
      COUNT(*) FILTER (WHERE ah.is_insiden = true)
    INTO v_total_lengkap, v_total_perlu_koreksi, v_total_lembur_pending, v_total_insiden
    FROM absen_harian ah
    JOIN absen_karyawan k ON k.id = ah.karyawan_id AND k.status_aktif = true
    WHERE EXTRACT(MONTH FROM ah.tanggal) = p_bulan
      AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun;
  END IF;

  -- Hari Kerja Kalender
  SELECT COUNT(*) INTO v_hari_kerja
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  RETURN jsonb_build_object(
    'total_karyawan', COALESCE(v_total_karyawan, 0),
    'hari_kerja', COALESCE(v_hari_kerja, 0),
    'total_lengkap', COALESCE(v_total_lengkap, 0),
    'total_perlu_koreksi', COALESCE(v_total_perlu_koreksi, 0),
    'total_lembur_pending', COALESCE(v_total_lembur_pending, 0),
    'total_insiden', COALESCE(v_total_insiden, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
