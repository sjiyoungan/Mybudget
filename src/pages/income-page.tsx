import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trash2, Upload } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatLongDate, formatShortDate, formatUsd } from '@/lib/format'
import { parseAdpPaystub, type PayLine, type Paystub } from '@/lib/paystub'
import { usePaystubs } from '@/lib/paystub-context'

export function IncomePage() {
  const { paystubs, upsertPaystub, removePaystub } = usePaystubs()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    paystubs[0]?.id ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const selected =
    paystubs.find((item) => item.id === selectedId) ?? paystubs[0] ?? null

  async function handleFile(file: File) {
    setError(null)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Upload the ADP earnings statement as a PDF.')
      return
    }

    setBusy(true)
    try {
      const { extractPdfTextItems } = await import('@/lib/extract-pdf')
      const items = await extractPdfTextItems(file)
      const parsed = parseAdpPaystub(items)
      const paystub: Paystub = {
        ...parsed,
        id: crypto.randomUUID(),
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      }
      upsertPaystub(paystub)
      setSelectedId(paystub.id)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not read that paystub PDF.',
      )
    } finally {
      setBusy(false)
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft data-icon="inline-start" />
                Dashboard
              </Link>
            </Button>
            <h1 className="font-heading mt-2 text-2xl font-medium">Income</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Upload an ADP earnings statement. We keep pay date, regular pay,
              Pick Your Perk, gross pay, deductions, and net pay. Year-to-date
              and employer “other benefits” are left off.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={onInputChange}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={busy}
          className={`rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? 'border-foreground bg-muted/50' : 'border-border hover:bg-muted/30'
          }`}
        >
          <Upload className="mx-auto mb-3 size-6" />
          <p className="font-medium">
            {busy ? 'Reading paystub…' : 'Drop an ADP PDF here, or click to upload'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Use the same earnings statement layout as your ADP download.
          </p>
        </button>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {paystubs.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {paystubs.map((stub) => (
              <Button
                key={stub.id}
                type="button"
                size="sm"
                variant={stub.id === selected?.id ? 'default' : 'outline'}
                onClick={() => setSelectedId(stub.id)}
              >
                {formatShortDate(stub.payDate)}
              </Button>
            ))}
          </div>
        ) : null}

        {selected ? (
          <PaystubDetail
            paystub={selected}
            onDelete={() => {
              removePaystub(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No paystubs yet</CardTitle>
              <CardDescription>
                After you upload a statement, the breakdown shows up here and
                the dashboard Income card uses net pay.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
    </div>
  )
}

function PaystubDetail({
  paystub,
  onDelete,
}: {
  paystub: Paystub
  onDelete: () => void
}) {
  const deductionTotal = paystub.deductions.reduce(
    (sum, item) => sum + item.amount,
    0,
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-xl font-medium">
              Pay date {formatLongDate(paystub.payDate)}
            </h2>
            <Badge variant="secondary">ADP</Badge>
          </div>
          {paystub.periodBeginning && paystub.periodEnding ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Period {formatShortDate(paystub.periodBeginning)} –{' '}
              {formatShortDate(paystub.periodEnding)}
            </p>
          ) : null}
        </div>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 data-icon="inline-start" />
          Remove
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Earnings</CardTitle>
          <CardDescription>What was added to this check.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {paystub.earnings.map((line) => (
            <AmountRow key={line.name} line={line} />
          ))}
          <Separator />
          <AmountRow
            line={{ name: 'Gross pay', amount: paystub.grossPay }}
            emphasized
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taken out before deposit</CardTitle>
          <CardDescription>
            Taxes and deductions from this check only. No year-to-date column.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {paystub.deductions.map((line) => (
            <AmountRow key={line.name} line={line} />
          ))}
          <Separator />
          <AmountRow
            line={{ name: 'Total deductions', amount: deductionTotal }}
            emphasized
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Net pay</CardTitle>
          <CardDescription>Amount deposited after everything above.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-3xl font-medium">
            {formatUsd(paystub.netPay)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function AmountRow({
  line,
  emphasized = false,
}: {
  line: PayLine
  emphasized?: boolean
}) {
  const negative = line.amount < 0
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={emphasized ? 'font-medium' : undefined}>{line.name}</span>
      <span
        className={
          negative
            ? 'text-destructive tabular-nums'
            : emphasized
              ? 'font-medium tabular-nums'
              : 'tabular-nums'
        }
      >
        {formatUsd(line.amount)}
      </span>
    </div>
  )
}
