-- Migration 042: Add kode_proyek & proyek_akses columns to absen_user_profiles and update User Management RPCs

ALTER TABLE absen_user_profiles 
ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006',
ADD COLUMN IF NOT EXISTS proyek_akses TEXT[] DEFAULT ARRAY['524006'];

-- Update absen_list_auth_users RPC to include kode_proyek and proyek_akses
CREATE OR REPLACE FUNCTION absen_list_auth_users()
RETURNS jsonb AS $$
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang dapat mengakses daftar user';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_order ORDER BY row_order->>'email'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'auth_created_at', u.created_at,
        'has_profile', (p.id IS NOT NULL),
        'nama', p.nama,
        'role', p.role,
        'kode_proyek', COALESCE(p.kode_proyek, '524006'),
        'proyek_akses', COALESCE(p.proyek_akses, ARRAY['524006']),
        'profile_created_at', p.created_at
      ) AS row_order
      FROM auth.users u
      LEFT JOIN absen_user_profiles p ON p.id = u.id
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update absen_upsert_user_profile RPC to accept p_kode_proyek and p_proyek_akses
CREATE OR REPLACE FUNCTION absen_upsert_user_profile(
  p_user_id uuid,
  p_nama text,
  p_role text,
  p_kode_proyek text DEFAULT '524006',
  p_proyek_akses text[] DEFAULT ARRAY['524006']
)
RETURNS jsonb AS $$
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang dapat mengelola user';
  END IF;

  IF p_role NOT IN ('admin','atasan','hrd','manajemen') THEN
    RAISE EXCEPTION 'Role tidak valid: %', p_role;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User tidak ditemukan di sistem autentikasi';
  END IF;

  INSERT INTO absen_user_profiles (id, nama, role, kode_proyek, proyek_akses)
  VALUES (p_user_id, p_nama, p_role, COALESCE(p_kode_proyek, '524006'), COALESCE(p_proyek_akses, ARRAY['524006']))
  ON CONFLICT (id) DO UPDATE SET
    nama = EXCLUDED.nama,
    role = EXCLUDED.role,
    kode_proyek = EXCLUDED.kode_proyek,
    proyek_akses = EXCLUDED.proyek_akses,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update absen_create_auth_user to accept p_kode_proyek and p_proyek_akses
CREATE OR REPLACE FUNCTION absen_create_auth_user(
  p_email text,
  p_password text,
  p_nama text,
  p_role text,
  p_kode_proyek text DEFAULT '524006',
  p_proyek_akses text[] DEFAULT ARRAY['524006']
)
RETURNS jsonb AS $$
DECLARE
  new_uid uuid;
  encrypted_pw text;
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang dapat membuat user baru';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) THEN
    RETURN jsonb_build_object('error', 'Email ' || p_email || ' sudah terdaftar');
  END IF;

  new_uid := gen_random_uuid();
  encrypted_pw := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    created_at, updated_at, phone, phone_confirmed_at,
    phone_change, phone_change_token, phone_change_sent_at,
    email_change, email_change_token, email_change_sent_at,
    confirmed_at, ban_duration, reauthentication_sent_at,
    is_sso_user, deleted_at, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_uid, 'authenticated', 'authenticated', lower(p_email), encrypted_pw,
    now(), NULL, NULL,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nama', p_nama, 'role', p_role, 'kode_proyek', COALESCE(p_kode_proyek, '524006')),
    FALSE,
    now(), now(), NULL, NULL,
    '', '', NULL,
    '', '', NULL,
    now(), NULL, NULL,
    FALSE, NULL, FALSE
  );

  INSERT INTO absen_user_profiles (id, nama, role, kode_proyek, proyek_akses)
  VALUES (new_uid, p_nama, p_role, COALESCE(p_kode_proyek, '524006'), COALESCE(p_proyek_akses, ARRAY['524006']))
  ON CONFLICT (id) DO UPDATE SET
    nama = EXCLUDED.nama,
    role = EXCLUDED.role,
    kode_proyek = EXCLUDED.kode_proyek,
    proyek_akses = EXCLUDED.proyek_akses,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'id', new_uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
