import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import { ExpenseDetailCards } from '@/components/budget-cards'
import { Button } from '@/components/ui/button'

export function ExpensesPage() {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft data-icon="inline-start" />
              Dashboard
            </Link>
          </Button>
          <h1 className="font-heading mt-4 text-3xl font-medium">
            Expenses
          </h1>
        </div>

        <ExpenseDetailCards />
      </main>
    </div>
  )
}
