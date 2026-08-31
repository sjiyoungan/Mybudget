import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import { DebtsCard } from '@/components/budget-cards'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { totalMonthlyExpenses } from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { formatUsdWhole, formatUsdWholeUp } from '@/lib/format'
import { currentMonthNet } from '@/lib/income'
import { usePaystubs } from '@/lib/paystub-context'

export function DashboardPage() {
  const { paystubs } = usePaystubs()
  const { expenses } = useBudget()

  const income = useMemo(
    () => Math.round(currentMonthNet(paystubs)),
    [paystubs],
  )
  const expenseTotal = useMemo(
    () => Math.ceil(totalMonthlyExpenses(expenses) - 1e-9),
    [expenses],
  )
  const remaining = income - expenseTotal

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <Link
            to="/income"
            className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="hover-fill">
              <CardHeader className="gap-5">
                <div className="flex items-start justify-between gap-2">
                  <CardDescription>Income</CardDescription>
                  <ChevronRight className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl">{formatUsdWhole(income)}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
          <Link
            to="/expenses"
            className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="hover-fill">
              <CardHeader className="gap-5">
                <div className="flex items-start justify-between gap-2">
                  <CardDescription>Expenses</CardDescription>
                  <ChevronRight className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl">{formatUsdWholeUp(expenseTotal)}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
          <Card>
            <CardHeader className="gap-5">
              <CardDescription>Remaining</CardDescription>
              <CardTitle className="text-2xl">{formatUsdWhole(remaining)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <DebtsCard />
      </main>
    </div>
  )
}
