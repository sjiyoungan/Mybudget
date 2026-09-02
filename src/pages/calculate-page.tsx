import { CalculationsPanel } from '@/components/budget-cards'

export function CalculatePage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-8">
      <div>
        <h1 className="font-heading text-3xl font-medium">Calculator</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          What is in each debit account. Need is the bills on Bank of America.
        </p>
      </div>
      <CalculationsPanel />
    </main>
  )
}
