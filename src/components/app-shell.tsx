import { NavLink, Outlet } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

import { PaystubUploadButton } from '@/components/paystub-upload'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

const PAGES = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/income', label: 'Income' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/debt', label: 'Debt' },
] as const

function navClass(isActive: boolean) {
  return cn(
    'hover-fill flex h-8 items-center rounded-lg px-2.5 text-sm',
    isActive && 'hover-fill-active font-medium',
  )
}

export function AppShell() {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-svh bg-background">
      <nav className="border-border sticky top-0 flex h-svh w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r px-3 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              aria-label="Account menu"
              className="h-8 w-full min-w-max justify-start gap-1 overflow-visible px-2.5"
            >
              <span className="text-sm font-medium">JI</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() => {
                void signOut()
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <PaystubUploadButton className="w-full justify-start" />

        <div className="grid gap-0.5">
          {PAGES.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.to === '/'}
              className={({ isActive }) => navClass(isActive)}
            >
              {page.label}
            </NavLink>
          ))}
        </div>

        <NavLink
          to="/calculate"
          className={({ isActive }) => navClass(isActive)}
        >
          Calculate
        </NavLink>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
