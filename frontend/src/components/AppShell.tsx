import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileTabBar from './MobileTabBar'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-h-screen pb-24 md:pb-10">
          <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
