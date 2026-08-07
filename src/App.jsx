import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import AdminPage from './pages/AdminPage'
import BoardPage from './pages/BoardPage'
import FormPage from './pages/FormPage'
import PeoplePage from './pages/PeoplePage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<FormPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
