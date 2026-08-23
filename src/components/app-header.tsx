import { Link } from 'react-router-dom'
import { ChevronDown, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth-context'

function profileInitial(email: string | undefined) {
  const letter = email?.trim().charAt(0)
  return letter ? letter.toUpperCase() : 'G'
}

export function AppHeader() {
  const { user, signOut } = useAuth()
  const initial = profileInitial(user?.email)

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
        <Link to="/" aria-label="Dashboard" className="flex items-center">
          <Wallet className="size-5" />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              aria-label="Account menu"
              className="ml-2 h-8 gap-1 px-1.5"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {initial}
              </span>
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
      </div>
    </header>
  )
}
