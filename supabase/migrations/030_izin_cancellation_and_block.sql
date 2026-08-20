-- ============================================================
-- 030: Blokir Absen Saat Izin Disetujui & Fitur Lapor Batal Izin
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah kolom alasan_batal jika belum ada
ALTER TABLE absen_izin ADD COLUMN IF NOT EXISTS alasan_batal text;

-- Drop constraint status jika ada, lalu perbarui agar mengizinkan CANCEL_REQUESTED & CANCELLED
ALTER TABLE absen_izin DROP CONSTRAINT IF EXISTS absen_izin_status_check;
ALTER TABLE absen_izin ADD CONSTRAINT absen_izin_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCEL_REQUESTED', 'CANCELLED'));

-- 2. Update RPC absen_catat_scan_wajah untuk menolak scan jika ada izin APPROVED pada hari tersebut
CREATE OR REPLACE FUNCTION absen_catat_scan_wajah(
  p_karyawan_id uuid,
  p_slot_id integer,
  p_lokasi_kerja text DEFAULT NULL,
  p_jenis_pekerjaan text DEFAULT NULL,
  p_keterangan text DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_gps_lat numeric DEFAULT NULL,
  p_gps_lng numeric DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_client_tz text DEFAULT NULL,
  p_waktu_scan timestamptz DEFAULT now()
)
RETURNS jsonb AS $$
DECLARE
  v_slot record;
  v_tz text;
  v_scan_local_time timestamp;
  v_scan_date date;
  v_existing_id uuid;
  v_scan_id uuid;
BEGIN
  -- Cek apakah ada izin APPROVED untuk hari ini
  v_scan_date := (p_waktu_scan AT TIME ZONE COALESCE(p_client_tz, 'Asia/Jakarta'))::date;

  IF EXISTS (
    SELECT 1 FROM absen_izin
    WHERE karyawan_id = p_karyawan_id
      AND status = 'APPROVED'
      AND v_scan_date BETWEEN tanggal_mulai AND tanggal_selesai
  ) THEN
    RETURN jsonb_build_object('error', 'Anda sedang dalam masa izin yang telah disetujui untuk hari ini. Silakan ajukan Batal Izin ke Admin jika ingin masuk kerja.');
  END IF;

  -- Ambil data slot
  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  v_tz := COALESCE(p_client_tz, 'Asia/Jakarta');
  v_scan_local_time := p_waktu_scan AT TIME ZONE v_tz;

  -- Cek duplikasi scan di slot & tanggal sama
  SELECT id INTO v_existing_id
  FROM absen_scan_wajah
  WHERE karyawan_id = p_karyawan_id
    AND slot_id = p_slot_id
    AND tanggal = v_scan_date;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Sudah absen untuk slot ini hari ini');
  END IF;

  -- Simpan scan
  INSERT INTO absen_scan_wajah (
    karyawan_id, slot_id, tanggal, waktu_scan,
    lokasi_kerja, jenis_pekerjaan, keterangan, foto_url,
    gps_lat, gps_lng, confidence
  ) VALUES (
    p_karyawan_id, p_slot_id, v_scan_date, p_waktu_scan,
    p_lokasi_kerja, p_jenis_pekerjaan, p_keterangan, p_foto_url,
    p_gps_lat, p_gps_lng, p_confidence
  ) RETURNING id INTO v_scan_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_scan_id,
    'tanggal', v_scan_date,
    'waktu', p_waktu_scan,
    'slot_label', v_slot.label
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC: Ajukan Pembatalan Izin (User)
CREATE OR REPLACE FUNCTION absen_ajukan_batal_izin(
  p_izin_id uuid,
  p_karyawan_id uuid,
  p_alasan_batal text
)
RETURNS jsonb AS $$
DECLARE
  v_izin record;
BEGIN
  SELECT * INTO v_izin FROM absen_izin WHERE id = p_izin_id AND karyawan_id = p_karyawan_id;
  IF v_izin IS NULL THEN
    RETURN jsonb_build_object('error', 'Data izin tidak ditemukan');
  END IF;

  IF v_izin.status != 'APPROVED' THEN
    RETURN jsonb_build_object('error', 'Hanya izin yang telah disetujui yang dapat dibatalkan');
  END IF;

  UPDATE absen_izin
  SET status = 'CANCEL_REQUESTED',
      alasan_batal = trim(p_alasan_batal),
      updated_at = now()
  WHERE id = p_izin_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RPC: Proses Pembatalan Izin (Admin)
CREATE OR REPLACE FUNCTION absen_proses_batal_izin(
  p_izin_id uuid,
  p_action text, -- 'APPROVE_CANCEL' atau 'REJECT_CANCEL'
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_izin record;
  v_new_status text;
BEGIN
  IF p_action NOT IN ('APPROVE_CANCEL', 'REJECT_CANCEL') THEN
    RETURN jsonb_build_object('error', 'Aksi tidak valid');
  END IF;

  SELECT * INTO v_izin FROM absen_izin WHERE id = p_izin_id;
  IF v_izin IS NULL THEN
    RETURN jsonb_build_object('error', 'Data izin tidak ditemukan');
  END IF;

  IF v_izin.status != 'CANCEL_REQUESTED' THEN
    RETURN jsonb_build_object('error', 'Izin ini tidak sedang dalam pengajuan pembatalan');
  END IF;

  IF p_action = 'APPROVE_CANCEL' THEN
    v_new_status := 'CANCELLED';
  ELSE
    v_new_status := 'APPROVED';
  END IF;

  UPDATE absen_izin
  SET status = v_new_status,
      catatan_admin = COALESCE(p_catatan, catatan_admin),
      updated_at = now()
  WHERE id = p_izin_id;

  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
