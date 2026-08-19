-- ============================================================
-- Migration 015: User Management RPCs
-- Shared database with simontok/simonika — admin manages
-- which auth users get SI Wajah profiles
-- ============================================================

-- List all auth users with their SI Wajah profile status
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
        'profile_created_at', p.created_at
      ) AS row_order
      FROM auth.users u
      LEFT JOIN absen_user_profiles p ON p.id = u.id
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or update a user profile for SI Wajah
CREATE OR REPLACE FUNCTION absen_upsert_user_profile(
  p_user_id uuid,
  p_nama text,
  p_role text
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

  INSERT INTO absen_user_profiles (id, nama, role)
  VALUES (p_user_id, p_nama, p_role)
  ON CONFLICT (id) DO UPDATE SET
    nama = EXCLUDED.nama,
    role = EXCLUDED.role,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove a user profile from SI Wajah (does not delete auth user)
CREATE OR REPLACE FUNCTION absen_delete_user_profile(p_user_id uuid)
RETURNS jsonb AS $$
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang dapat menghapus user';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Tidak dapat menghapus profil sendiri';
  END IF;

  DELETE FROM absen_user_profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil user tidak ditemukan';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
