import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBudget } from '@/lib/budget-context'
import { formatShortDate, formatUsd } from '@/lib/format'
import { useSpending } from '@/lib/spending-context'
import { sortSpendingTxns, type SpendingTxn } from '@/lib/spending'
import { cn } from '@/lib/utils'

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function formatTxnAmount(amount: number) {
  if (amount < 0) return `+${formatUsd(-amount)}`
  return formatUsd(amount)
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function accountName(
  accountId: string,
  accounts: { id: string; name: string }[],
) {
  return accounts.find((account) => account.id === accountId)?.name ?? 'Unknown'
}

export function SpendingPage() {
  const { transactions, rules, updateTransaction, removeTransaction, addRule, removeRule } =
    useSpending()
  const { accounts } = useBudget()
  const [editing, setEditing] = useState<SpendingTxn | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)

  const grouped = useMemo(() => {
    const sorted = sortSpendingTxns(transactions)
    const months: { key: string; items: SpendingTxn[] }[] = []
    for (const txn of sorted) {
      const key = txn.date.slice(0, 7)
      const last = months[months.length - 1]
      if (last?.key === key) last.items.push(txn)
      else months.push({ key, items: [txn] })
    }
    return months
  }, [transactions])

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-medium">Spending</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Upload bank statements, then rename purchases or set rules.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
          Rules
        </Button>
      </div>

      {transactions.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-sm">
            Upload a PDF, CSV, or OFX statement from the Upload menu to log
            purchases here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {grouped.map((group) => (
            <section key={group.key} className="grid gap-2">
              <h2 className="font-heading text-lg font-medium">{monthLabel(group.key)}</h2>
              <Card>
                <CardContent className="px-0">
                  <ul>
                    {group.items.map((txn) => (
                      <li key={txn.id} className="border-b last:border-b-0">
                        <button
                          type="button"
                          className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-2.5 text-left"
                          onClick={() => setEditing(txn)}
                        >
                          <span className="text-muted-foreground w-[4.5rem] shrink-0 text-xs">
                            {formatShortDate(txn.date).replace(/,\s+\d{4}$/, '')}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{txn.merchant}</span>
                          <span className="text-muted-foreground hidden w-24 shrink-0 truncate text-xs sm:block">
                            {accountName(txn.accountId, accounts)}
                          </span>
                          <span
                            className={cn(
                              'w-[5.5rem] shrink-0 text-right tabular-nums',
                              txn.amount < 0 && 'text-muted-foreground',
                            )}
                          >
                            {formatTxnAmount(txn.amount)}
                          </span>
                          <Pencil className="text-muted-foreground size-3.5 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}

      <EditTxnDialog
        txn={editing}
        accounts={accounts}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => {
          updateTransaction(id, patch)
          setEditing(null)
        }}
        onDelete={(id) => {
          removeTransaction(id)
          setEditing(null)
        }}
      />

      <RulesDialog
        open={rulesOpen}
        rules={rules}
        onClose={() => setRulesOpen(false)}
        onAdd={addRule}
        onRemove={removeRule}
      />
    </main>
  )
}

function EditTxnDialog({
  txn,
  accounts,
  onClose,
  onSave,
  onDelete,
}: {
  txn: SpendingTxn | null
  accounts: { id: string; name: string }[]
  onClose: () => void
  onSave: (id: string, patch: Partial<Omit<SpendingTxn, 'id'>>) => void
  onDelete: (id: string) => void
}) {
  return (
    <Dialog open={txn != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {txn ? (
          <EditTxnForm
            key={txn.id}
            txn={txn}
            accounts={accounts}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditTxnForm({
  txn,
  accounts,
  onSave,
  onDelete,
}: {
  txn: SpendingTxn
  accounts: { id: string; name: string }[]
  onSave: (id: string, patch: Partial<Omit<SpendingTxn, 'id'>>) => void
  onDelete: (id: string) => void
}) {
  const [merchant, setMerchant] = useState(txn.merchant)
  const [amount, setAmount] = useState(Math.abs(txn.amount).toFixed(2))
  const [date, setDate] = useState(txn.date)
  const [accountId, setAccountId] = useState(txn.accountId)
  const parsedAmount = parseAmount(amount)
  const deposit = txn.amount < 0
  const accountOptions =
    accountId && !accounts.some((account) => account.id === accountId)
      ? [{ id: accountId, name: 'Unknown' }, ...accounts]
      : accounts

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit purchase</DialogTitle>
        <DialogDescription>
          {txn.description !== txn.merchant
            ? txn.description
            : 'Change the name, amount, date, or account.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Name</span>
          <Input value={merchant} onChange={(event) => setMerchant(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">
              {deposit ? 'Deposit' : 'Amount'}
            </span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Account</span>
          <Select value={accountId || undefined} onValueChange={setAccountId}>
            <SelectTrigger className="w-full" aria-label="Account">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="destructive" onClick={() => onDelete(txn.id)}>
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
        <Button
          type="button"
          disabled={!merchant.trim() || parsedAmount == null || parsedAmount <= 0 || !date}
          onClick={() => {
            if (parsedAmount == null) return
            const signed = deposit ? -parsedAmount : parsedAmount
            onSave(txn.id, {
              merchant: merchant.trim(),
              amount: signed,
              date,
              accountId,
              customName: merchant.trim() !== txn.merchant ? true : txn.customName,
            })
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

function RulesDialog({
  open,
  rules,
  onClose,
  onAdd,
  onRemove,
}: {
  open: boolean
  rules: { id: string; match: string; merchant: string }[]
  onClose: () => void
  onAdd: (input: { match: string; merchant: string }) => void
  onRemove: (id: string) => void
}) {
  const [match, setMatch] = useState('')
  const [merchant, setMerchant] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMatch('')
          setMerchant('')
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename rules</DialogTitle>
          <DialogDescription>
            If a description contains this word or phrase, always use that name.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rules yet.</p>
          ) : (
            <ul className="grid gap-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{rule.match}</span>
                    <span className="text-muted-foreground"> → {rule.merchant}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${rule.match}`}
                    onClick={() => onRemove(rule.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">Contains</span>
              <Input
                value={match}
                placeholder="AMZN"
                onChange={(event) => setMatch(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">Name</span>
              <Input
                value={merchant}
                placeholder="Amazon"
                onChange={(event) => setMerchant(event.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!match.trim() || !merchant.trim()}
              onClick={() => {
                onAdd({ match, merchant })
                setMatch('')
                setMerchant('')
              }}
            >
              <Plus data-icon="inline-start" />
              Add
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
