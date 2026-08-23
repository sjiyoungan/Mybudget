import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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

type Transaction = {
  id: string
  name: string
  amount: number
  category: string
}

const starterTransactions: Transaction[] = [
  { id: '1', name: 'Paycheck', amount: 3200, category: 'Income' },
  { id: '2', name: 'Rent', amount: -1450, category: 'Housing' },
  { id: '3', name: 'Groceries', amount: -186.42, category: 'Food' },
  { id: '4', name: 'Transit pass', amount: -90, category: 'Transport' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function App() {
  const [transactions, setTransactions] = useState(starterTransactions)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.amount > 0)
      .reduce((sum, item) => sum + item.amount, 0)
    const expenses = transactions
      .filter((item) => item.amount < 0)
      .reduce((sum, item) => sum + Math.abs(item.amount), 0)

    return {
      income,
      expenses,
      remaining: income - expenses,
      spentPercent: income === 0 ? 0 : Math.min(100, (expenses / income) * 100),
    }
  }, [transactions])

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
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-5" />
            <span className="font-heading text-lg font-medium">Mybudget</span>
          </div>
          <Badge variant="secondary">Starter</Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Income" value={currency.format(totals.income)} />
          <SummaryCard
            label="Expenses"
            value={currency.format(totals.expenses)}
          />
          <SummaryCard
            label="Remaining"
            value={currency.format(totals.remaining)}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Monthly spend</CardTitle>
            <CardDescription>
              {currency.format(totals.expenses)} of{' '}
              {currency.format(totals.income)} used this month
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
              <CardDescription>Sample data lives in local state.</CardDescription>
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
                        item.amount >= 0 ? 'text-foreground' : 'text-destructive'
                      }
                    >
                      {item.amount > 0 ? '+' : ''}
                      {currency.format(item.amount)}
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
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

export default App
