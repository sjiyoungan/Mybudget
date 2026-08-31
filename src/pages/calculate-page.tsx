import { CalculationsPanel } from '@/components/budget-cards'
import {
  Card,
  CardContent,
} from '@/components/ui/card'

export function CalculatePage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <div>
        <h1 className="font-heading text-3xl font-medium">Calculate</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Fill in what is in BoA Debit and Disc Debit. Need comes from the
          bills assigned to the bills account.
        </p>
      </div>
      <Card>
        <CardContent>
          <CalculationsPanel />
        </CardContent>
      </Card>
    </main>
  )
}
