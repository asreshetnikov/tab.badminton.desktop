import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, UsersRound, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { useAppSettings } from '@renderer/contexts/AppSettingsContext'

export function Sidebar() {
  const { t } = useTranslation()
  const { settings } = useAppSettings()

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.tournaments'), end: true },
    { to: '/players', icon: Users, label: t('nav.players') },
    { to: '/teams', icon: UsersRound, label: t('nav.teams') }
  ]

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4 gap-2">
        <span className="text-base font-semibold tracking-tight">Tab Badminton</span>
        {settings.demoMode && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-300">
            Demo
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )
          }
        >
          <Settings className="h-4 w-4" />
          {t('nav.settings')}
        </NavLink>
      </div>
    </aside>
  )
}
