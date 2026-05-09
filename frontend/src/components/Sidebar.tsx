import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../stores/auth'
import Logo from './Logo'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  { to: '/chores', label: 'Chores', Icon: CheckCircleIcon },
  { to: '/bills', label: 'Bills', Icon: CurrencyDollarIcon },
  { to: '/chat', label: 'Chat', Icon: ChatBubbleLeftRightIcon },
  { to: '/complaints', label: 'Complaints', Icon: ExclamationTriangleIcon },
  { to: '/profile', label: 'Profile', Icon: UserCircleIcon },
] as const

export default function Sidebar() {
  const { signOut } = useAuthStore()
  return (
    <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-100 px-4 py-6 sticky top-0 h-screen">
      <div className="px-2 mb-8">
        <Logo size="md" />
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={signOut}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition"
      >
        <ArrowRightOnRectangleIcon className="h-5 w-5" />
        Sign out
      </button>
    </aside>
  )
}
