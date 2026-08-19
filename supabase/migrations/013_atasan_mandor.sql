-- ============================================================
-- Change atasan_id: reference absen_karyawan (mandor) instead of absen_user_profiles
-- Mandor = karyawan with jabatan 'Mandor'
-- ============================================================

-- 1. Drop old FK pointing to absen_user_profiles
ALTER TABLE absen_karyawan DROP CONSTRAINT IF EXISTS absen_karyawan_atasan_id_fkey;

-- 2. Clear any existing atasan_id values that don't match karyawan IDs
UPDATE absen_karyawan SET atasan_id = NULL
WHERE atasan_id IS NOT NULL
  AND atasan_id NOT IN (SELECT id FROM absen_karyawan);

-- 3. Add self-referencing FK
ALTER TABLE absen_karyawan
  ADD CONSTRAINT absen_karyawan_atasan_id_fkey
  FOREIGN KEY (atasan_id) REFERENCES absen_karyawan(id);

-- 4. Fix RLS policies that used atasan_id = auth.uid() (no longer valid)
DROP POLICY IF EXISTS "karyawan_select" ON absen_karyawan;
CREATE POLICY "karyawan_select" ON absen_karyawan FOR SELECT USING (
  absen_get_user_role() IN ('admin','hrd','manajemen','atasan')
);

DROP POLICY IF EXISTS "harian_select" ON absen_harian;
CREATE POLICY "harian_select" ON absen_harian FOR SELECT USING (
  absen_get_user_role() IN ('admin','hrd','manajemen','atasan')
);

DROP POLICY IF EXISTS "koreksi_select" ON absen_koreksi_log;
CREATE POLICY "koreksi_select" ON absen_koreksi_log FOR SELECT USING (
  absen_get_user_role() IN ('admin','hrd','manajemen','atasan')
);

-- 5. Update import karyawan to also set atasan_id by mandor name
CREATE OR REPLACE FUNCTION absen_import_karyawan(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_added integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors text[] := '{}';
  v_existing_id uuid;
  v_uid text;
  v_nama text;
  v_jabatan text;
  v_mandor text;
  v_mandor_id uuid;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_uid := v_item->>'uid_mesin';
    v_nama := v_item->>'nama';
    v_jabatan := v_item->>'jabatan';
    v_mandor := v_item->>'mandor';
    v_mandor_id := NULL;

    IF v_mandor IS NOT NULL AND v_mandor != '' THEN
      SELECT id INTO v_mandor_id
      FROM absen_karyawan
      WHERE LOWER(nama) = LOWER(v_mandor)
        AND LOWER(jabatan) LIKE '%mandor%'
        AND status_aktif = true
      LIMIT 1;
    END IF;

    SELECT id INTO v_existing_id
    FROM absen_karyawan
    WHERE v_uid = ANY(uid_mesin)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE absen_karyawan
      SET jabatan = COALESCE(NULLIF(v_jabatan, ''), jabatan),
          atasan_id = COALESCE(v_mandor_id, atasan_id),
          updated_at = now()
      WHERE id = v_existing_id
        AND (
          (v_jabatan IS NOT NULL AND v_jabatan != '' AND (jabatan IS NULL OR jabatan != v_jabatan))
          OR (v_mandor_id IS NOT NULL AND (atasan_id IS NULL OR atasan_id != v_mandor_id))
        );

      IF FOUND THEN
        v_updated := v_updated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    ELSE
      BEGIN
        INSERT INTO absen_karyawan (nama, uid_mesin, jabatan, status_aktif, atasan_id)
        VALUES (v_nama, ARRAY[v_uid], NULLIF(v_jabatan, ''), true, v_mandor_id);
        v_added := v_added + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errors := array_append(v_errors, v_nama || ': ' || SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'added', v_added,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
