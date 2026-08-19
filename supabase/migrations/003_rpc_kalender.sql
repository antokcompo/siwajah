-- ============================================================
-- RPC Functions untuk Kalender Kerja (SECURITY DEFINER)
-- Bypass RLS agar generate & toggle bisa berjalan
-- ============================================================

-- Generate kalender satu bulan sekaligus (bulk upsert)
CREATE OR REPLACE FUNCTION absen_generate_kalender(p_tahun integer, p_bulan integer)
RETURNS jsonb AS $$
DECLARE
  v_start date;
  v_end date;
  v_tanggal date;
  v_inserted integer := 0;
  v_skipped integer := 0;
BEGIN
  v_start := make_date(p_tahun, p_bulan, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  v_tanggal := v_start;
  WHILE v_tanggal <= v_end LOOP
    INSERT INTO absen_kalender (tanggal, jenis_hari, keterangan)
    VALUES (
      v_tanggal,
      CASE WHEN extract(dow FROM v_tanggal) = 0 THEN 'minggu' ELSE 'kerja' END,
      CASE WHEN extract(dow FROM v_tanggal) = 0 THEN 'Hari Minggu' ELSE NULL END
    )
    ON CONFLICT (tanggal) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;

    v_tanggal := v_tanggal + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'total_days', (v_end - v_start + 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle jenis hari pada tanggal tertentu
CREATE OR REPLACE FUNCTION absen_update_kalender(p_tanggal date, p_jenis_hari text, p_keterangan text DEFAULT NULL)
RETURNS jsonb AS $$
BEGIN
  IF p_jenis_hari NOT IN ('kerja', 'libur_nasional', 'libur_perusahaan', 'minggu') THEN
    RAISE EXCEPTION 'Jenis hari tidak valid: %', p_jenis_hari;
  END IF;

  UPDATE absen_kalender
  SET jenis_hari = p_jenis_hari,
      keterangan = p_keterangan
  WHERE tanggal = p_tanggal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tanggal % tidak ditemukan di kalender', p_tanggal;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- List kalender per bulan (bypass RLS)
CREATE OR REPLACE FUNCTION absen_list_kalender(p_start date, p_end date)
RETURNS SETOF absen_kalender AS $$
  SELECT * FROM absen_kalender
  WHERE tanggal >= p_start AND tanggal <= p_end
  ORDER BY tanggal;
$$ LANGUAGE sql SECURITY DEFINER;
