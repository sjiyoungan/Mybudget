import { EditAccountsButton, ExpenseDetailCards } from '@/components/budget-cards'

export function ExpensesPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 pb-8 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-medium">Expenses</h1>
        <EditAccountsButton />
      </div>
      <ExpenseDetailCards />
    </main>
  )
}
