-- ============================================================
-- 029: Fix RPC create auth user, reset password, & delete user
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Fix RPC absen_create_auth_user (menggunakan gen_salt('bf', 10) sesuai GoTrue Auth standard)
CREATE OR REPLACE FUNCTION absen_create_auth_user(
  p_email text,
  p_password text,
  p_nama text,
  p_role text
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_clean_email text;
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RETURN jsonb_build_object('error', 'Hanya admin yang dapat membuat user baru');
  END IF;

  IF p_role NOT IN ('admin','atasan','hrd','manajemen') THEN
    RETURN jsonb_build_object('error', 'Role tidak valid: ' || p_role);
  END IF;

  v_clean_email := lower(trim(p_email));

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_clean_email) THEN
    RETURN jsonb_build_object('error', 'Email sudah terdaftar di sistem');
  END IF;

  v_user_id := gen_random_uuid();

  -- Insert to auth.users with bcrypt cost 10
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token, email_change_token_new
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf', 10)),
    now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nama', p_nama),
    false, '', '', ''
  );

  -- Insert to auth.identities (provider_id HARUS v_user_id::text)
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
    'email',
    now(), now(), now()
  ) ON CONFLICT DO NOTHING;

  -- Insert to absen_user_profiles
  INSERT INTO absen_user_profiles (id, nama, role)
  VALUES (v_user_id, p_nama, p_role)
  ON CONFLICT (id) DO UPDATE SET nama = EXCLUDED.nama, role = EXCLUDED.role;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix RPC absen_admin_reset_password (menggunakan gen_salt('bf', 10))
CREATE OR REPLACE FUNCTION absen_admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS jsonb AS $$
DECLARE
  v_email text;
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RETURN jsonb_build_object('error', 'Hanya admin yang dapat reset password');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('error', 'User tidak ditemukan');
  END IF;

  -- Update auth.users with bcrypt cost 10
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      updated_at = now()
  WHERE id = p_user_id;

  -- Ensure auth.identities has email provider with provider_id = p_user_id::text
  DELETE FROM auth.identities WHERE user_id = p_user_id AND provider = 'email';

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    p_user_id,
    p_user_id,
    p_user_id::text,
    jsonb_build_object('sub', p_user_id::text, 'email', v_email),
    'email',
    now(), now(), now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC: Hapus user auth & profile secara permanen
CREATE OR REPLACE FUNCTION absen_delete_auth_user(p_user_id uuid)
RETURNS jsonb AS $$
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RETURN jsonb_build_object('error', 'Hanya admin yang dapat menghapus user');
  END IF;

  DELETE FROM absen_user_profiles WHERE id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
