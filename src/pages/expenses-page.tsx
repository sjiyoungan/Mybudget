import { ExpenseDetailCards } from '@/components/budget-cards'

export function ExpensesPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <h1 className="font-heading text-3xl font-medium">Expenses</h1>
      <ExpenseDetailCards />
    </main>
  )
}
