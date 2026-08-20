-- ============================================================
-- 029: Fix RPC create auth user & reset password agar include auth.identities
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Fix RPC absen_create_auth_user
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

  -- Insert to auth.users
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
    crypt(p_password, gen_salt('bf')),
    now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nama', p_nama),
    false, '', '', ''
  );

  -- Insert to auth.identities (PENTING untuk Supabase GoTrue Auth)
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    v_clean_email,
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


-- 2. Fix RPC absen_admin_reset_password
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

  -- Update auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      updated_at = now()
  WHERE id = p_user_id;

  -- Ensure auth.identities has email provider
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    p_user_id,
    p_user_id,
    v_email,
    jsonb_build_object('sub', p_user_id::text, 'email', v_email),
    'email',
    now(), now(), now()
  ) ON CONFLICT (provider_id, provider) DO UPDATE
    SET identity_data = jsonb_build_object('sub', p_user_id::text, 'email', v_email),
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
