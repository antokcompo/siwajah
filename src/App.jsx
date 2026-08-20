import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { UserAuthProvider, useUserAuth } from './contexts/UserAuthContext'
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
import JadwalSlot from './pages/JadwalSlot'
import LaporanIzin from './pages/LaporanIzin'

import UserLayout from './pages/user/UserLayout'
import UserIzin from './pages/user/UserIzin'
import UserLaporanTerlewat from './pages/user/UserLaporanTerlewat'
import UserLogin from './pages/user/UserLogin'
import UserBeranda from './pages/user/UserBeranda'
import UserDaftarWajah from './pages/user/UserDaftarWajah'
import UserScan from './pages/user/UserScan'
import UserRiwayat from './pages/user/UserRiwayat'
import UserProfil from './pages/user/UserProfil'

function UserProtected() {
  const { karyawan, loading } = useUserAuth()
  if (loading) return <div className="flex items-center justify-center h-screen bg-[#0a0e1a]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>
  if (!karyawan) return <Navigate to="/user/login" />
  return <Outlet />
}

function UserRoutes() {
  return (
    <UserAuthProvider>
      <Routes>
        <Route path="login" element={<UserLogin />} />
        <Route element={<UserProtected />}>
          <Route element={<UserLayout />}>
            <Route index element={<UserBeranda />} />
            <Route path="daftar-wajah" element={<UserDaftarWajah />} />
            <Route path="scan" element={<UserScan />} />
            <Route path="riwayat" element={<UserRiwayat />} />
            <Route path="izin" element={<UserIzin />} />
            <Route path="laporan-terlewat" element={<UserLaporanTerlewat />} />
            <Route path="profil" element={<UserProfil />} />
          </Route>
        </Route>
      </Routes>
    </UserAuthProvider>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <Routes>
      {/* User app (separate from admin) */}
      <Route path="/user/*" element={<UserRoutes />} />

      {/* Admin routes */}
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
              <Route path="/jadwal-slot" element={<JadwalSlot />} />
              <Route path="/laporan-izin" element={<LaporanIzin />} />
              <Route path="/audit-log" element={<AuditLog />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}
