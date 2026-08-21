import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const SUPER_USER_EMAIL = 'kuswibowo.heri@gmail.com'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [appPermissionsMap, setAppPermissionsMap] = useState(() => {
    try {
      const saved = localStorage.getItem('portal_app_permissions')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const userEmail = user?.email || ''
  // ONLY kuswibowo.heri@gmail.com is Super User
  const isSuperUser = userEmail.toLowerCase() === SUPER_USER_EMAIL.toLowerCase()

  // Compute effective profile with clean name and dynamic system role
  const effectiveProfile = (() => {
    const emailName = userEmail ? userEmail.split('@')[0] : ''
    const cleanName = emailName ? emailName.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : 'User'

    if (isSuperUser) {
      return {
        id: user?.id,
        ...(profile || {}),
        nama: cleanName,
        role: 'admin'
      }
    }

    if (profile) {
      return {
        ...profile,
        nama: (profile.nama === 'Tiara' || profile.nama === 'Admin' || profile.nama === 'User' || !profile.nama) ? cleanName : profile.nama,
        role: profile.role || 'atasan'
      }
    }

    if (user) {
      return {
        id: user.id,
        nama: cleanName,
        role: 'atasan'
      }
    }

    return null
  })()

  async function fetchProfile(userId, uEmail) {
    if (!userId) return

    try { await supabase.rpc('absen_ensure_user_profile') } catch {}

    const emailName = uEmail ? uEmail.split('@')[0] : ''
    const cleanName = emailName ? emailName.split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'User'

    const { data } = await supabase
      .from('absen_user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      // Auto-correct placeholder 'Tiara' or empty name to clean email name
      if (data.nama === 'Tiara' || !data.nama) {
        try {
          await supabase
            .from('absen_user_profiles')
            .update({ nama: cleanName })
            .eq('id', userId)
          data.nama = cleanName
        } catch {}
      }
      setProfile(data)
    } else {
      const isSuperEmail = uEmail?.toLowerCase() === SUPER_USER_EMAIL.toLowerCase()
      const targetRole = isSuperEmail ? 'admin' : 'atasan'
      const newProf = { id: userId, nama: cleanName, role: targetRole }
      setProfile(newProf)
      try {
        await supabase
          .from('absen_user_profiles')
          .insert(newProf)
      } catch {}
    }
  }

  async function fetchUserAppPermissionsFromDB(userId, uEmail) {
    try {
      const { data, error } = await supabase.rpc('portal_get_user_allowed_apps', {
        p_user_id: userId,
        p_email: uEmail
      })
      if (!error && Array.isArray(data)) {
        const apps = data.map(item => typeof item === 'string' ? item : item.app_code)
        if (apps.length > 0) {
          setAppPermissionsMap(prev => {
            const updated = { ...prev, [userId]: apps }
            try { localStorage.setItem('portal_app_permissions', JSON.stringify(updated)) } catch {}
            return updated
          })
        }
      }
    } catch {}
  }

  useEffect(() => {
    // 1. Automatic SSO Token URL Handshake Reader
    const urlParams = new URLSearchParams(window.location.search)
    const ssoToken = urlParams.get('sso_token')
    
    if (ssoToken) {
      try {
        supabase.auth.setSession({
          access_token: ssoToken,
          refresh_token: ssoToken
        }).then(({ data: { session } }) => {
          if (session?.user) {
            setUser(session.user)
            fetchProfile(session.user.id, session.user.email)
            fetchUserAppPermissionsFromDB(session.user.id, session.user.email)
          }
          // Remove sso_token from URL address bar for clean UX
          const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]sso_token=[^&]+/, '').replace(/^&/, '?')
          window.history.replaceState({}, document.title, cleanUrl || window.location.pathname)
        }).catch(() => {})
      } catch {}
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email)
        fetchUserAppPermissionsFromDB(session.user.id, session.user.email)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email)
        fetchUserAppPermissionsFromDB(session.user.id, session.user.email)
      } else {
        setProfile(null)
      }
    })

    return () => subscription?.unsubscribe?.()
  }, [])

  function getUserAllowedApps(targetUserId, targetUserEmail) {
    if (targetUserEmail?.toLowerCase() === SUPER_USER_EMAIL.toLowerCase()) {
      return ['siwajah', 'simontok', 'simonika']
    }
    const custom = appPermissionsMap[targetUserId]
    if (custom && Array.isArray(custom)) {
      return custom
    }
    return ['siwajah']
  }

  function hasAppAccess(appCode) {
    if (!user) return false
    if (isSuperUser) return true
    const allowed = getUserAllowedApps(user.id, user.email)
    return allowed.includes(appCode)
  }

  async function toggleUserAppAccess(targetUserId, targetUserEmail, appCode) {
    if (targetUserEmail?.toLowerCase() === SUPER_USER_EMAIL.toLowerCase()) {
      return
    }
    const current = getUserAllowedApps(targetUserId, targetUserEmail)
    let updated
    if (current.includes(appCode)) {
      updated = current.filter(a => a !== appCode)
    } else {
      updated = [...current, appCode]
    }
    const newMap = { ...appPermissionsMap, [targetUserId]: updated }
    setAppPermissionsMap(newMap)
    try {
      localStorage.setItem('portal_app_permissions', JSON.stringify(newMap))
    } catch {}

    try {
      await supabase.rpc('portal_toggle_app_access', {
        p_target_user_id: targetUserId,
        p_target_email: targetUserEmail,
        p_app_code: appCode
      })
    } catch {}
  }

  async function signIn(email, password) {
    const cleanEmail = email ? email.trim().toLowerCase() : ''
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile: effectiveProfile,
      loading,
      isSuperUser,
      getUserAllowedApps,
      hasAppAccess,
      toggleUserAppAccess,
      signIn,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
