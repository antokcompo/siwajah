-- ============================================================
-- FIX: Batch audit log for import operations
--
-- Problem: The audit trigger fires FOR EACH ROW on absen_harian,
-- so importing 60 employees creates ~60+ individual audit entries.
--
-- Fix:
-- 1. Update trigger to skip per-row audit when import_id IS NOT NULL
-- 2. Update import function to insert a single batch audit entry
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Update audit trigger: skip per-row audit for import operations
CREATE OR REPLACE FUNCTION absen_audit_trigger_fn()
RETURNS trigger AS $$
BEGIN
  -- Skip per-row audit for batch import operations on absen_harian
  IF TG_TABLE_NAME = 'absen_harian' AND TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.import_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, new_value)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, old_value, new_value)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, old_value)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update import function: add single batch audit entry
CREATE OR REPLACE FUNCTION absen_import_dan_proses(
  p_scans jsonb,
  p_nama_file text
)
RETURNS jsonb AS $$
DECLARE
  v_import_id uuid;
  v_tanggal_mulai date;
  v_tanggal_akhir date;
  v_jumlah_baris integer;
  v_uid_tidak_dikenal text[];
  v_cfg_dedup_menit integer;
  v_cfg_masuk_awal time;
  v_cfg_masuk_akhir time;
  v_cfg_pulang_mulai time;
  v_cfg_lembur_ambang time;
  v_cfg_lembur_mulai time;
  v_cfg_lembur_maks numeric;
  v_cfg_lembur_pembulatan integer;
  v_cfg_anomali_persen numeric;
  v_tz text;
  v_rec record;
  v_jam_masuk time;
  v_jam_pulang time;
  v_status text;
  v_jam_lembur numeric;
  v_status_lembur text;
  v_avg_lengkap numeric;
  v_count_lengkap integer;
  v_anomali_dates date[];
  v_inserted integer := 0;
  v_updated integer := 0;
BEGIN
  v_jumlah_baris := jsonb_array_length(p_scans);

  -- Load timezone from config
  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'), 'Asia/Jayapura') INTO v_tz;

  -- Load config
  SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'dedup_menit'), 3) INTO v_cfg_dedup_menit;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'jam_masuk_awal'), '04:00') INTO v_cfg_masuk_awal;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'jam_masuk_akhir'), '10:59') INTO v_cfg_masuk_akhir;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'jam_pulang_mulai'), '14:30') INTO v_cfg_pulang_mulai;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_ambang'), '18:30') INTO v_cfg_lembur_ambang;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_mulai_hitung'), '19:00') INTO v_cfg_lembur_mulai;
  SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'lembur_maks_jam'), 4) INTO v_cfg_lembur_maks;
  SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'lembur_pembulatan_menit'), 15) INTO v_cfg_lembur_pembulatan;
  SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'anomali_persen_ambang'), 50) INTO v_cfg_anomali_persen;

  -- Create import log
  v_import_id := gen_random_uuid();
  INSERT INTO absen_import_log (id, nama_file, jumlah_baris, diimport_oleh, status)
  VALUES (v_import_id, p_nama_file, v_jumlah_baris, auth.uid(), 'success');

  -- Insert raw scans
  INSERT INTO absen_scan_mentah (uid_mesin, timestamp_scan, data_mentah, import_id)
  SELECT
    s->>'uid',
    ((s->>'timestamp')::timestamp) AT TIME ZONE v_tz,
    s,
    v_import_id
  FROM jsonb_array_elements(p_scans) s;

  -- Resolve UID -> karyawan_id
  UPDATE absen_scan_mentah sm
  SET karyawan_id = k.id
  FROM absen_karyawan k
  WHERE sm.uid_mesin = ANY(k.uid_mesin)
    AND sm.import_id = v_import_id
    AND sm.karyawan_id IS NULL
    AND k.status_aktif = true;

  -- Collect unknown UIDs
  SELECT array_agg(DISTINCT uid_mesin)
  INTO v_uid_tidak_dikenal
  FROM absen_scan_mentah
  WHERE import_id = v_import_id AND karyawan_id IS NULL;

  -- Get date range
  SELECT
    MIN((timestamp_scan AT TIME ZONE v_tz)::date),
    MAX((timestamp_scan AT TIME ZONE v_tz)::date)
  INTO v_tanggal_mulai, v_tanggal_akhir
  FROM absen_scan_mentah WHERE import_id = v_import_id;

  -- Update import log
  UPDATE absen_import_log
  SET tanggal_mulai = v_tanggal_mulai,
      tanggal_akhir = v_tanggal_akhir,
      uid_tidak_dikenal = COALESCE(v_uid_tidak_dikenal, '{}')
  WHERE id = v_import_id;

  -- Mark duplicates
  WITH ordered_scans AS (
    SELECT id, uid_mesin, timestamp_scan,
      LAG(timestamp_scan) OVER (
        PARTITION BY uid_mesin, (timestamp_scan AT TIME ZONE v_tz)::date
        ORDER BY timestamp_scan
      ) AS prev_ts
    FROM absen_scan_mentah
    WHERE import_id = v_import_id AND karyawan_id IS NOT NULL
  )
  UPDATE absen_scan_mentah sm
  SET is_duplikat = true
  FROM ordered_scans os
  WHERE sm.id = os.id
    AND os.prev_ts IS NOT NULL
    AND EXTRACT(EPOCH FROM (os.timestamp_scan - os.prev_ts)) < (v_cfg_dedup_menit * 60);

  -- Process attendance per karyawan per tanggal
  FOR v_rec IN
    SELECT
      karyawan_id,
      (timestamp_scan AT TIME ZONE v_tz)::date AS tanggal,
      MIN(CASE
        WHEN (timestamp_scan AT TIME ZONE v_tz)::time BETWEEN v_cfg_masuk_awal AND v_cfg_masuk_akhir
        THEN (timestamp_scan AT TIME ZONE v_tz)::time
      END) AS scan_masuk,
      MAX(CASE
        WHEN (timestamp_scan AT TIME ZONE v_tz)::time >= v_cfg_pulang_mulai
        THEN (timestamp_scan AT TIME ZONE v_tz)::time
      END) AS scan_pulang,
      bool_and(
        (timestamp_scan AT TIME ZONE v_tz)::time > v_cfg_masuk_akhir
        AND (timestamp_scan AT TIME ZONE v_tz)::time < v_cfg_pulang_mulai
      ) AS hanya_tengah
    FROM absen_scan_mentah
    WHERE import_id = v_import_id
      AND karyawan_id IS NOT NULL
      AND is_duplikat = false
    GROUP BY karyawan_id, (timestamp_scan AT TIME ZONE v_tz)::date
  LOOP
    v_jam_masuk := v_rec.scan_masuk;
    v_jam_pulang := v_rec.scan_pulang;
    v_jam_lembur := 0;
    v_status_lembur := NULL;

    -- Determine status
    IF v_rec.hanya_tengah AND v_jam_masuk IS NULL AND v_jam_pulang IS NULL THEN
      v_status := 'HANYA_SCAN_TENGAH';
    ELSIF v_jam_masuk IS NOT NULL AND v_jam_pulang IS NOT NULL THEN
      v_status := 'LENGKAP';
    ELSIF v_jam_masuk IS NOT NULL AND v_jam_pulang IS NULL THEN
      v_status := 'TANPA_PULANG';
    ELSIF v_jam_masuk IS NULL AND v_jam_pulang IS NOT NULL THEN
      v_status := 'TANPA_MASUK';
    ELSE
      v_status := 'HANYA_SCAN_TENGAH';
    END IF;

    -- Calculate overtime
    IF v_jam_pulang IS NOT NULL AND v_jam_pulang >= v_cfg_lembur_ambang THEN
      v_jam_lembur := EXTRACT(EPOCH FROM (v_jam_pulang - v_cfg_lembur_mulai)) / 3600.0;
      IF v_jam_lembur < 0 THEN v_jam_lembur := 0; END IF;
      IF v_cfg_lembur_pembulatan > 0 THEN
        v_jam_lembur := FLOOR(v_jam_lembur * 60 / v_cfg_lembur_pembulatan) * v_cfg_lembur_pembulatan / 60.0;
      END IF;
      IF v_jam_lembur > v_cfg_lembur_maks THEN v_jam_lembur := v_cfg_lembur_maks; END IF;
      IF v_jam_lembur > 0 THEN v_status_lembur := 'PENDING_APPROVAL'; END IF;
    END IF;

    -- Upsert attendance and track insert vs update
    IF EXISTS (SELECT 1 FROM absen_harian WHERE karyawan_id = v_rec.karyawan_id AND tanggal = v_rec.tanggal) THEN
      UPDATE absen_harian SET
        jam_masuk = v_jam_masuk,
        jam_pulang = v_jam_pulang,
        status = v_status,
        jam_lembur = v_jam_lembur,
        status_lembur = v_status_lembur,
        sumber = 'sistem',
        import_id = v_import_id,
        updated_at = now()
      WHERE karyawan_id = v_rec.karyawan_id AND tanggal = v_rec.tanggal;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, jam_pulang, status, jam_lembur, status_lembur, sumber, import_id)
      VALUES (v_rec.karyawan_id, v_rec.tanggal, v_jam_masuk, v_jam_pulang, v_status, v_jam_lembur, v_status_lembur, 'sistem', v_import_id);
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- Also insert TIDAK_ADA_SCAN for active employees who have NO scan on work days
  WITH inserted_rows AS (
    INSERT INTO absen_harian (karyawan_id, tanggal, status, sumber, import_id)
    SELECT k.id, cal.tanggal, 'TIDAK_ADA_SCAN', 'sistem', v_import_id
    FROM absen_karyawan k
    CROSS JOIN absen_kalender cal
    WHERE k.status_aktif = true
      AND cal.jenis_hari = 'kerja'
      AND cal.tanggal BETWEEN v_tanggal_mulai AND v_tanggal_akhir
      AND NOT EXISTS (
        SELECT 1 FROM absen_harian h
        WHERE h.karyawan_id = k.id AND h.tanggal = cal.tanggal
      )
    ON CONFLICT (karyawan_id, tanggal) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted_rows;

  -- Detect mass anomalies
  v_anomali_dates := '{}';
  FOR v_rec IN
    SELECT tanggal,
      COUNT(*) AS cnt_total,
      COUNT(*) FILTER (WHERE status = 'LENGKAP') AS cnt_lengkap
    FROM absen_harian
    WHERE tanggal BETWEEN v_tanggal_mulai AND v_tanggal_akhir
    GROUP BY tanggal
  LOOP
    IF v_rec.cnt_total > 0
       AND (v_rec.cnt_lengkap::numeric / v_rec.cnt_total * 100) < v_cfg_anomali_persen THEN
      IF EXISTS (SELECT 1 FROM absen_kalender WHERE tanggal = v_rec.tanggal AND jenis_hari = 'kerja') THEN
        v_anomali_dates := array_append(v_anomali_dates, v_rec.tanggal);
        UPDATE absen_harian SET is_insiden = true
        WHERE tanggal = v_rec.tanggal AND import_id = v_import_id;
      END IF;
    END IF;
  END LOOP;

  -- Insert single batch audit log entry
  INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, new_value)
  VALUES (
    auth.uid(),
    'IMPORT',
    'absen_harian',
    v_import_id::text,
    jsonb_build_object(
      'nama_file', p_nama_file,
      'jumlah_baris', v_jumlah_baris,
      'inserted', v_inserted,
      'updated', v_updated,
      'tanggal_mulai', v_tanggal_mulai,
      'tanggal_akhir', v_tanggal_akhir,
      'uid_tidak_dikenal', COALESCE(v_uid_tidak_dikenal, '{}')
    )
  );

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'jumlah_baris', v_jumlah_baris,
    'tanggal_mulai', v_tanggal_mulai,
    'tanggal_akhir', v_tanggal_akhir,
    'uid_tidak_dikenal', COALESCE(v_uid_tidak_dikenal, '{}'),
    'anomali_dates', v_anomali_dates
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
