-- ============================================================================
-- MIGRATION 041: ENTERPRISE PORTAL APP PERMISSIONS & SUPER USER CONFIGURATION
-- ============================================================================

-- 1. Create Master Table for Portal Applications
CREATE TABLE IF NOT EXISTS public.portal_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    badge VARCHAR(100),
    description TEXT,
    url VARCHAR(255) DEFAULT '/',
    target_type VARCHAR(20) DEFAULT '_self', -- '_self' (Internal Route) or '_blank' (External Online URL)
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns if table already existed
ALTER TABLE public.portal_apps ADD COLUMN IF NOT EXISTS url VARCHAR(255) DEFAULT '/';
ALTER TABLE public.portal_apps ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) DEFAULT '_self';

-- Seed Initial System Master Data with Exact Descriptions & Target URLs
INSERT INTO public.portal_apps (code, name, badge, description, url, target_type)
VALUES 
    ('siwajah', 'SI WAJAH', 'Absensi & Wajah', 'Sistem Informasi Web Absensi dan Aktifitas Harian', '/siwajah', '_self'),
    ('simontok', 'SIMONTOK', 'Monitoring Keuangan', 'Sistem Informasi Monitoring Keuangan', 'https://simontok.domain.com', '_blank'),
    ('simonika', 'SIMONIKA', 'Monitoring Kas', 'Sistem Informasi Monitoring Kas', 'https://simonika.domain.com', '_blank')
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name,
    badge = EXCLUDED.badge,
    description = EXCLUDED.description,
    url = COALESCE(public.portal_apps.url, EXCLUDED.url),
    target_type = COALESCE(public.portal_apps.target_type, EXCLUDED.target_type);

-- 2. Create User App Entitlements Matrix Table
CREATE TABLE IF NOT EXISTS public.portal_user_app_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    app_code VARCHAR(50) REFERENCES public.portal_apps(code) ON DELETE CASCADE,
    is_allowed BOOLEAN DEFAULT true,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, app_code)
);

-- Enable RLS
ALTER TABLE public.portal_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_user_app_permissions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active apps
CREATE POLICY "Allow public read access to active portal_apps"
    ON public.portal_apps FOR SELECT USING (is_active = true);

-- Allow authenticated users read permissions
CREATE POLICY "Allow authenticated read user permissions"
    ON public.portal_user_app_permissions FOR SELECT TO authenticated USING (true);

-- 3. RPC Helper to Check Super User Status
CREATE OR REPLACE FUNCTION public.portal_is_super_user(p_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN LOWER(TRIM(p_email)) = 'kuswibowo.heri@gmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC Helper to Fetch All Registered Portal Applications & URLs
CREATE OR REPLACE FUNCTION public.portal_get_apps()
RETURNS TABLE(
    code VARCHAR,
    name VARCHAR,
    badge VARCHAR,
    description TEXT,
    url VARCHAR,
    target_type VARCHAR,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY 
    SELECT a.code, a.name, a.badge, a.description, a.url, a.target_type, a.is_active
    FROM public.portal_apps a
    ORDER BY a.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC Helper to Update App Configuration & Online URLs
CREATE OR REPLACE FUNCTION public.portal_update_app_config(
    p_code VARCHAR,
    p_name VARCHAR,
    p_description TEXT,
    p_url VARCHAR,
    p_target_type VARCHAR
)
RETURNS JSONB AS $$
DECLARE
    v_caller_email TEXT;
BEGIN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    
    IF NOT public.portal_is_super_user(v_caller_email) AND LOWER(v_caller_email) != 'kuswibowo.heri@gmail.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hanya Super User (kuswibowo.heri@gmail.com) yang berhak mengubah konfigurasi aplikasi.');
    END IF;

    UPDATE public.portal_apps
    SET name = p_name,
        description = p_description,
        url = p_url,
        target_type = p_target_type,
        updated_at = NOW()
    WHERE code = p_code;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC Helper to Fetch User's Allowed Apps
CREATE OR REPLACE FUNCTION public.portal_get_user_allowed_apps(p_user_id UUID, p_email TEXT)
RETURNS TABLE(app_code VARCHAR) AS $$
BEGIN
    IF public.portal_is_super_user(p_email) THEN
        RETURN QUERY SELECT a.code FROM public.portal_apps a WHERE a.is_active = true;
    ELSE
        RETURN QUERY 
        SELECT p.app_code 
        FROM public.portal_user_app_permissions p
        WHERE p.user_id = p_user_id AND p.is_allowed = true
        UNION
        SELECT 'siwajah'::VARCHAR AS app_code;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC Helper for Super User to Toggle Permissions
CREATE OR REPLACE FUNCTION public.portal_toggle_app_access(
    p_target_user_id UUID,
    p_target_email TEXT,
    p_app_code VARCHAR
)
RETURNS JSONB AS $$
DECLARE
    v_caller_email TEXT;
    v_exists BOOLEAN;
    v_current_allowed BOOLEAN;
BEGIN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    
    IF NOT public.portal_is_super_user(v_caller_email) AND LOWER(v_caller_email) != 'kuswibowo.heri@gmail.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hanya Super User (kuswibowo.heri@gmail.com) yang berhak mengubah hak akses aplikasi.');
    END IF;

    IF public.portal_is_super_user(p_target_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hak akses Super User tidak dapat dicabut.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.portal_user_app_permissions 
        WHERE user_id = p_target_user_id AND app_code = p_app_code
    ) INTO v_exists;

    IF v_exists THEN
        SELECT is_allowed INTO v_current_allowed 
        FROM public.portal_user_app_permissions 
        WHERE user_id = p_target_user_id AND app_code = p_app_code;

        UPDATE public.portal_user_app_permissions
        SET is_allowed = NOT v_current_allowed,
            updated_at = NOW(),
            granted_by = auth.uid()
        WHERE user_id = p_target_user_id AND app_code = p_app_code;
    ELSE
        INSERT INTO public.portal_user_app_permissions (user_id, app_code, is_allowed, granted_by)
        VALUES (p_target_user_id, p_app_code, true, auth.uid());
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
