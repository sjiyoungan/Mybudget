import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { CalculationsDialog } from '@/components/budget-cards'
import { PaystubUploadButton } from '@/components/paystub-upload'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth-context'

export function AppHeader() {
  const { signOut } = useAuth()
  const [calculateOpen, setCalculateOpen] = useState(false)

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              aria-label="Account menu"
              className="h-8 w-auto min-w-max shrink-0 gap-1 overflow-visible px-2"
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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCalculateOpen(true)}
          >
            Calculate
          </Button>
          <PaystubUploadButton />
        </div>
      </div>
      <CalculationsDialog open={calculateOpen} onOpenChange={setCalculateOpen} />
    </header>
  )
}
