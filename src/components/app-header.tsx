import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <Wallet className="size-5" />
          <span className="font-heading text-lg font-medium">Mybudget</span>
        </Link>
        <Badge variant="secondary">Starter</Badge>
      </div>
    </header>
  )
}
