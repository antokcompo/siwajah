-- ============================================================
-- Migration 009: Ensure user profile + fix konfigurasi save
-- ============================================================

-- 1. Function to auto-create user profile if not exists
--    First authenticated user gets 'admin' role
CREATE OR REPLACE FUNCTION absen_ensure_user_profile()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_role text;
  v_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  -- Already exists?
  IF EXISTS (SELECT 1 FROM absen_user_profiles WHERE id = v_user_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Profile exists');
  END IF;

  -- Get email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- First user becomes admin, others default to 'atasan'
  SELECT COUNT(*) INTO v_count FROM absen_user_profiles;
  v_role := CASE WHEN v_count = 0 THEN 'admin' ELSE 'atasan' END;

  INSERT INTO absen_user_profiles (id, nama, role)
  VALUES (v_user_id, COALESCE(SPLIT_PART(v_email, '@', 1), 'User'), v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'role', v_role, 'message', 'Profile created');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix konfigurasi save: upsert all keys, SECURITY DEFINER
CREATE OR REPLACE FUNCTION absen_save_konfigurasi(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_key text;
  v_value text;
  v_count integer := 0;
BEGIN
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_data)
  LOOP
    INSERT INTO absen_konfigurasi (key, value, deskripsi, updated_at)
    VALUES (v_key, v_value, v_key, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Read konfigurasi (SECURITY DEFINER, bypasses RLS)
CREATE OR REPLACE FUNCTION absen_get_konfigurasi()
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_object_agg(key, value)
  INTO v_result
  FROM absen_konfigurasi;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
