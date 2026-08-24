import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { formatUsd } from '@/lib/format'
import { usePaystubs } from '@/lib/paystub-context'

type Transaction = {
  id: string
  name: string
  amount: number
  category: string
}

const starterExpenses: Transaction[] = [
  { id: '2', name: 'Rent', amount: -1450, category: 'Housing' },
  { id: '3', name: 'Groceries', amount: -186.42, category: 'Food' },
  { id: '4', name: 'Transit pass', amount: -90, category: 'Transport' },
]

export function DashboardPage() {
  const { paystubs } = usePaystubs()
  const [transactions, setTransactions] = useState(starterExpenses)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const income = useMemo(
    () => paystubs.reduce((sum, stub) => sum + stub.netPay, 0),
    [paystubs],
  )

  const totals = useMemo(() => {
    const expenses = transactions
      .filter((item) => item.amount < 0)
      .reduce((sum, item) => sum + Math.abs(item.amount), 0)

    return {
      income,
      expenses,
      remaining: income - expenses,
      spentPercent: income === 0 ? 0 : Math.min(100, (expenses / income) * 100),
    }
  }, [income, transactions])

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = Number.parseFloat(amount)
    if (!name.trim() || Number.isNaN(parsed) || parsed === 0) return

    setTransactions((current) => [
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        amount: parsed,
        category: parsed > 0 ? 'Income' : 'Expense',
      },
      ...current,
    ])
    setName('')
    setAmount('')
  }

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <Link
            to="/income"
            className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader className="gap-5">
                <div className="flex items-start justify-between gap-2">
                  <CardDescription>Income</CardDescription>
                  <ChevronRight className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl">
                  {formatUsd(totals.income)}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
          <SummaryCard
            label="Expenses"
            value={formatUsd(totals.expenses)}
          />
          <SummaryCard
            label="Remaining"
            value={formatUsd(totals.remaining)}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Monthly spend</CardTitle>
            <CardDescription>
              {formatUsd(totals.expenses)} of {formatUsd(totals.income)} used
              this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={totals.spentPercent} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add transaction</CardTitle>
              <CardDescription>
                Use a negative amount for spending.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleAdd}>
                <Input
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-label="Transaction name"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-label="Transaction amount"
                />
                <Button type="submit">
                  <Plus data-icon="inline-start" />
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>
                Expenses stay here. Paychecks live on Income.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {transactions.map((item, index) => (
                <div key={item.id}>
                  {index > 0 ? <Separator className="mb-3" /> : null}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.category}
                      </p>
                    </div>
                    <span
                      className={
                        item.amount >= 0
                          ? 'text-foreground'
                          : 'text-destructive'
                      }
                    >
                      {item.amount > 0 ? '+' : ''}
                      {formatUsd(item.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="gap-5">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
