-- RPC function to read and update konfigurasi
-- Uses SECURITY DEFINER to bypass potential RLS issues

CREATE OR REPLACE FUNCTION absen_get_konfigurasi()
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_object_agg(key, jsonb_build_object('value', value, 'deskripsi', deskripsi))
  INTO v_result
  FROM absen_konfigurasi;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION absen_save_konfigurasi(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_key text;
  v_value text;
  v_count integer := 0;
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang bisa mengubah konfigurasi';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_data)
  LOOP
    UPDATE absen_konfigurasi
    SET value = v_value, updated_at = now()
    WHERE key = v_key;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
