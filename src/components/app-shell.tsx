import { useEffect, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, Menu, X } from 'lucide-react'

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
  { to: '/spending', label: 'Spending' },
] as const

const BOTTOM_PAGES = [{ to: '/calculate', label: 'Calculator' }] as const

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

const TREE_ITEM_H = 32
const TREE_ITEM_GAP = 2
const TREE_FROM_PARENT = TREE_ITEM_H + TREE_ITEM_GAP
const TREE_LINE_X = 15
const TREE_RAIL_INSET = 25
const TREE_CORNER = 5
const TREE_STEM = 11
const TREE_ARROW = 5
const TREE_FILL_GAP = 2
const TREE_GUTTER = TREE_LINE_X + TREE_STEM + TREE_ARROW + TREE_FILL_GAP

function NavTreeActivePath({
  activeIndex,
  itemCount,
}: {
  activeIndex: number
  itemCount: number
}) {
  if (activeIndex < 0) return null

  const treeH = itemCount * TREE_ITEM_H + (itemCount - 1) * TREE_ITEM_GAP
  const height = TREE_FROM_PARENT + treeH
  const y =
    TREE_FROM_PARENT +
    activeIndex * (TREE_ITEM_H + TREE_ITEM_GAP) +
    TREE_ITEM_H / 2
  const x = TREE_LINE_X
  const stemEnd = x + TREE_STEM
  const width = stemEnd + TREE_ARROW + 2

  return (
    <svg
      className="nav-tree-active-path"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      overflow="visible"
      aria-hidden
    >
      <path
        d={`M ${x} ${TREE_RAIL_INSET} L ${x} ${y - TREE_CORNER} Q ${x} ${y} ${x + TREE_CORNER} ${y} L ${stemEnd} ${y}`}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M ${stemEnd} ${y - 3.5} L ${stemEnd + TREE_ARROW} ${y} L ${stemEnd} ${y + 3.5} Z`}
        fill="currentColor"
      />
    </svg>
  )
}

function AccountMenu() {
  const { signOut } = useAuth()
  return (
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
  )
}

function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const activeSubIndex = SUB_PAGES.findIndex((page) => page.to === pathname)

  return (
    <div className="grid gap-0.5">
      <div
        className="nav-group"
        style={
          {
            '--nav-tree-line': `${TREE_LINE_X}px`,
            '--nav-tree-gutter': `${TREE_GUTTER}px`,
            '--nav-tree-rail-top': `${TREE_RAIL_INSET}px`,
          } as CSSProperties
        }
      >
        {TOP_PAGES.map((page) => (
          <NavLink
            key={page.to}
            to={page.to}
            end={page.end}
            onClick={onNavigate}
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
              onClick={onNavigate}
              className={({ isActive }) => subNavClass(isActive)}
            >
              {page.label}
            </NavLink>
          ))}
        </div>
        <NavTreeActivePath
          activeIndex={activeSubIndex}
          itemCount={SUB_PAGES.length}
        />
      </div>
      {BOTTOM_PAGES.map((page) => (
        <NavLink
          key={page.to}
          to={page.to}
          onClick={onNavigate}
          className={({ isActive }) => navClass(isActive)}
        >
          {page.label}
        </NavLink>
      ))}
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    function closeOnDesktop() {
      if (media.matches) setMenuOpen(false)
    }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div className="flex min-h-svh bg-background">
      <nav className="border-border sticky top-0 hidden h-svh w-52 shrink-0 flex-col gap-6 overflow-y-auto border-r px-3 py-4 lg:flex">
        <div className="flex items-center justify-between gap-6">
          <AccountMenu />
          <PaystubUploadButton iconOnly />
        </div>
        <AppNav />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border sticky top-0 z-40 flex h-14 items-center gap-1 border-b bg-background px-2 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <AccountMenu />
          <div className="flex-1" />
          <PaystubUploadButton iconOnly />
        </header>

        <div className="min-w-0 flex-1 lg:pt-[60px]">
          <Outlet />
        </div>
      </div>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <header className="border-border flex h-14 shrink-0 items-center gap-1 border-b px-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <X />
            </Button>
            <AccountMenu />
          </header>
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <AppNav onNavigate={() => setMenuOpen(false)} />
          </nav>
        </div>
      ) : null}
    </div>
  )
}
