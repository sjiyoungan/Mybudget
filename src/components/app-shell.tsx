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

const TOP_PAGES = [
  { to: '/', label: 'Dashboard', end: true },
] as const

const SUB_PAGES = [
  { to: '/income', label: 'Income' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/debt', label: 'Debt' },
] as const

const BOTTOM_PAGES = [{ to: '/calculate', label: 'Calculate' }] as const

function navClass(isActive: boolean) {
  return cn(
    'hover-fill flex h-8 items-center rounded-lg px-2.5 text-sm',
    isActive && 'hover-fill-active font-medium',
  )
}

function subNavClass(isActive: boolean) {
  return cn(
    'nav-tree-item hover-fill relative flex h-8 items-center rounded-lg px-2.5 text-sm',
    isActive && 'nav-tree-item-active hover-fill-active font-medium',
  )
}

export function AppShell() {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-svh bg-background">
      <nav className="border-border sticky top-0 flex h-svh w-52 shrink-0 flex-col gap-6 overflow-y-auto border-r px-3 py-4">
        <div className="flex items-center justify-between gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="default"
                aria-label="Account menu"
                className="h-8 w-auto shrink-0 justify-start gap-1 overflow-visible px-2.5"
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
          <PaystubUploadButton iconOnly />
        </div>

        <div className="grid gap-0.5">
          {TOP_PAGES.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.end}
              className={({ isActive }) => navClass(isActive)}
            >
              {page.label}
            </NavLink>
          ))}
          <div className="nav-tree">
            {SUB_PAGES.map((page) => (
              <NavLink
                key={page.to}
                to={page.to}
                className={({ isActive }) => subNavClass(isActive)}
              >
                {page.label}
              </NavLink>
            ))}
          </div>
          {BOTTOM_PAGES.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              className={({ isActive }) => navClass(isActive)}
            >
              {page.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1 pt-[60px]">
        <Outlet />
      </div>
    </div>
  )
}
