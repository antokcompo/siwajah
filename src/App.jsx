import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ImportAbsensi from './pages/ImportAbsensi'
import RekapHarian from './pages/RekapHarian'
import Koreksi from './pages/Koreksi'
import ApprovalLembur from './pages/ApprovalLembur'
import RekapBulanan from './pages/RekapBulanan'
import MasterKaryawan from './pages/MasterKaryawan'
import KalenderKerja from './pages/KalenderKerja'
import Konfigurasi from './pages/Konfigurasi'
import AuditLog from './pages/AuditLog'
import ManajemenUser from './pages/ManajemenUser'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/import" element={<ImportAbsensi />} />
              <Route path="/rekap-harian" element={<RekapHarian />} />
              <Route path="/koreksi" element={<Koreksi />} />
              <Route path="/approval-lembur" element={<ApprovalLembur />} />
              <Route path="/rekap-bulanan" element={<RekapBulanan />} />
              <Route path="/master-karyawan" element={<MasterKaryawan />} />
              <Route path="/kalender" element={<KalenderKerja />} />
              <Route path="/konfigurasi" element={<Konfigurasi />} />
              <Route path="/manajemen-user" element={<ManajemenUser />} />
              <Route path="/audit-log" element={<AuditLog />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}
