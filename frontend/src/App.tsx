import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import BoardPage from './pages/BoardPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

function Private({ children }: { children: ReactElement }) {
  const { token, loading } = useAuth()
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        Loading…
      </div>
    )
  if (!token) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <Private>
            <DashboardPage />
          </Private>
        }
      />
      <Route
        path="/boards/:boardId"
        element={
          <Private>
            <BoardPage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ThemeFromStorage() {
  useEffect(() => {
    const t = (localStorage.getItem('taskboard_theme') as 'light' | 'dark') || 'light'
    document.documentElement.dataset.theme = t
  }, [])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeFromStorage />
      <AppRoutes />
    </AuthProvider>
  )
}
