import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  if (!user) return <Navigate to="/login" />
  if (roles && profile && !roles.includes(profile.role)) return <div className="p-8 text-center text-red-600">Anda tidak memiliki akses ke halaman ini.</div>

  return children
}
