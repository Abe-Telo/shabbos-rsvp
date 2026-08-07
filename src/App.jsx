import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider } from './lib/AuthContext'
import AdminPage from './pages/AdminPage'
import BoardPage from './pages/BoardPage'
import FormPage from './pages/FormPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfilePage from './pages/PublicProfilePage'

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<FormPage />} />
            <Route path="board" element={<BoardPage />} />
            <Route path="food" element={<BoardPage defaultTab="food" />} />
            <Route path="people" element={<BoardPage defaultTab="past" />} />
            <Route path="sheet" element={<BoardPage defaultTab="sheet" />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="u/:username" element={<PublicProfilePage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
