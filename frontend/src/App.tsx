import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'
import RootRedirect from './components/RootRedirect'
import AppShell from './components/AppShell'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toaster'
import ConfirmDialogHost from './components/ConfirmDialog'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Chores from './pages/Chores'
import Bills from './pages/Bills'
import Chat from './pages/Chat'
import Complaints from './pages/Complaints'
import Profile from './pages/Profile'
import GroupCreate from './pages/GroupCreate'
import GroupJoin from './pages/GroupJoin'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Toaster />
      <ConfirmDialogHost />
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <Register />
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/group/create"
          element={
            <ProtectedRoute>
              <GroupCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/group/join"
          element={
            <ProtectedRoute>
              <GroupJoin />
            </ProtectedRoute>
          }
        />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chores" element={<Chores />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
