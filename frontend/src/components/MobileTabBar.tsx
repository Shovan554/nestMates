import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'

const TABS = [
  { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  { to: '/chores', label: 'Chores', Icon: CheckCircleIcon },
  { to: '/bills', label: 'Bills', Icon: CurrencyDollarIcon },
  { to: '/chat', label: 'Chat', Icon: ChatBubbleLeftRightIcon },
  { to: '/complaints', label: 'Strikes', Icon: ExclamationTriangleIcon },
  { to: '/profile', label: 'Profile', Icon: UserCircleIcon },
] as const

export default function MobileTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-30">
      <ul className="grid grid-cols-6">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  isActive ? 'text-primary-700' : 'text-gray-500'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
