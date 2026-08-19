-- ============================================================
-- Migration 016: Create User + Password Management
-- ============================================================

-- 1. Admin creates new auth user + SI Wajah profile
CREATE OR REPLACE FUNCTION absen_create_auth_user(
  p_email text,
  p_password text,
  p_nama text,
  p_role text
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang dapat membuat user baru';
  END IF;

  IF p_role NOT IN ('admin','atasan','hrd','manajemen') THEN
    RAISE EXCEPTION 'Role tidak valid: %', p_role;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'Email sudah terdaftar di sistem';
  END IF;

  v_user_id := gen_random_uuid();

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
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nama', p_nama),
    false, '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    lower(p_email),
    jsonb_build_object('sub', v_user_id::text, 'email', lower(p_email)),
    'email',
    now(), now(), now()
  );

  INSERT INTO absen_user_profiles (id, nama, role)
  VALUES (v_user_id, p_nama, p_role);

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Admin resets password for any user
CREATE OR REPLACE FUNCTION absen_admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS jsonb AS $$
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang dapat reset password';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User tidak ditemukan';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. User changes own password (verifies current password first)
CREATE OR REPLACE FUNCTION absen_change_own_password(
  p_current_password text,
  p_new_password text
)
RETURNS jsonb AS $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT (encrypted_password = crypt(p_current_password, encrypted_password))
  INTO v_valid
  FROM auth.users
  WHERE id = auth.uid();

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Password lama tidak sesuai';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
