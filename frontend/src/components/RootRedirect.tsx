import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export default function RootRedirect() {
  const { user, loading } = useAuthStore()
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading…</div>
      </div>
    )
  }
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}
