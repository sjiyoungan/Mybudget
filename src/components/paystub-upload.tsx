import { useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Upload } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useBudget } from '@/lib/budget-context'
import { formatLongDate } from '@/lib/format'
import { parseAdpPaystub, type Paystub } from '@/lib/paystub'
import { usePaystubs } from '@/lib/paystub-context'
import { parseStatementFile } from '@/lib/spending-parse'
import { useSpending } from '@/lib/spending-context'
import type { SpendingUploadBatch } from '@/lib/spending'
import { cn } from '@/lib/utils'

async function readPaystubFile(file: File): Promise<Paystub> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error(`${file.name} is not a PDF.`)
  }

  const { extractPdfTextItems } = await import('@/lib/extract-pdf')
  const items = await extractPdfTextItems(file)
  const parsed = parseAdpPaystub(items)
  return {
    ...parsed,
    id: crypto.randomUUID(),
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
  }
}

const MAX_FILES = 20

type PendingStatement = {
  id: string
  file: File
  pageCount: number | null
}

function isStatementPdf(file: File) {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  )
}

function allPages(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1)
}

function summaryMessage(saved: number, skipped: number, failed: string[]) {
  const parts: string[] = []
  if (saved > 0) {
    parts.push(`Saved ${saved} paycheck${saved === 1 ? '' : 's'}.`)
  }
  if (skipped > 0) {
    parts.push(
      `Skipped ${skipped} that already ${skipped === 1 ? 'has' : 'have'} that pay date.`,
    )
  }
  if (failed.length > 0) {
    parts.push(`Could not read ${failed.join(', ')}.`)
  }
  return parts.join(' ')
}

function spendingSummary(saved: number, failed: string[]) {
  const parts: string[] = []
  if (saved > 0) {
    parts.push(`Logged ${saved} purchase${saved === 1 ? '' : 's'}.`)
  }
  if (failed.length > 0) {
    parts.push(`Could not read ${failed.join(', ')}.`)
  }
  return parts.join(' ')
}

export function PaystubUploadButton({
  className,
  iconOnly = false,
}: {
  className?: string
  iconOnly?: boolean
}) {
  const { paystubs, upsertPaystub } = usePaystubs()
  const { accounts } = useBudget()
  const { importTransactions } = useSpending()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const spendingInputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [pendingStatements, setPendingStatements] = useState<PendingStatement[]>(
    [],
  )
  const [selectedPages, setSelectedPages] = useState<Record<string, number[]>>(
    {},
  )
  const [pendingStub, setPendingStub] = useState<Paystub | null>(null)

  const busy = progress != null

  async function handleFiles(fileList: FileList) {
    const files = [...fileList]
    if (files.length === 0) return

    if (files.length > MAX_FILES) {
      setMessage(`Upload up to ${MAX_FILES} PDFs at a time.`)
      return
    }

    setMessage(null)

    if (files.length === 1) {
      setProgress({ current: 1, total: 1 })
      try {
        const stub = await readPaystubFile(files[0])
        if (paystubs.some((item) => item.payDate === stub.payDate)) {
          setPendingStub(stub)
          return
        }
        upsertPaystub(stub)
      } catch (caught) {
        setMessage(
          caught instanceof Error
            ? caught.message
            : 'Could not read that paystub PDF.',
        )
      } finally {
        setProgress(null)
      }
      return
    }

    const knownDates = new Set(paystubs.map((item) => item.payDate))
    let saved = 0
    let skipped = 0
    const failed: string[] = []

    setProgress({ current: 0, total: files.length })
    for (const [index, file] of files.entries()) {
      setProgress({ current: index + 1, total: files.length })
      try {
        const stub = await readPaystubFile(file)
        if (knownDates.has(stub.payDate)) {
          skipped += 1
          continue
        }
        upsertPaystub(stub)
        knownDates.add(stub.payDate)
        saved += 1
      } catch (caught) {
        failed.push(
          file.name ||
            (caught instanceof Error ? caught.message : 'one file'),
        )
      }
    }
    setProgress(null)

    if (skipped > 0 || failed.length > 0 || saved > 1) {
      setMessage(
        summaryMessage(saved, skipped, failed) ||
          'None of those files could be added.',
      )
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (files && files.length > 0) void handleFiles(files)
    event.target.value = ''
  }

  async function handleSpendingFiles(fileList: FileList) {
    const files = [...fileList]
    if (files.length === 0) return

    if (files.length > MAX_FILES) {
      setMessage(`Upload up to ${MAX_FILES} statements at a time.`)
      return
    }

    setMessage(null)
    setProgress({ current: 0, total: files.length })
    const pending: PendingStatement[] = []
    const pages: Record<string, number[]> = {}

    for (const [index, file] of files.entries()) {
      setProgress({ current: index + 1, total: files.length })
      const id = crypto.randomUUID()
      if (isStatementPdf(file)) {
        try {
          const { countPdfPages } = await import('@/lib/extract-pdf')
          const pageCount = await countPdfPages(file)
          pending.push({ id, file, pageCount })
          pages[id] = allPages(pageCount)
        } catch {
          pending.push({ id, file, pageCount: 0 })
          pages[id] = []
        }
      } else {
        pending.push({ id, file, pageCount: null })
      }
    }

    setProgress(null)
    setSelectedPages(pages)
    setPendingStatements(pending)
  }

  function toggleStatementPage(id: string, page: number) {
    setSelectedPages((current) => {
      const selected = current[id] ?? []
      const next = selected.includes(page)
        ? selected.filter((item) => item !== page)
        : [...selected, page].sort((left, right) => left - right)
      return { ...current, [id]: next }
    })
  }

  function canImportStatements() {
    return pendingStatements.some((item) => {
      if (item.pageCount == null) return true
      return (selectedPages[item.id] ?? []).length > 0
    })
  }

  async function importPendingStatements() {
    const pending = pendingStatements
    if (pending.length === 0) return
    setPendingStatements([])
    setProgress({ current: 0, total: pending.length })
    const batches: SpendingUploadBatch[] = []
    const failed: string[] = []

    for (const [index, item] of pending.entries()) {
      setProgress({ current: index + 1, total: pending.length })
      const pages =
        item.pageCount == null ? undefined : (selectedPages[item.id] ?? [])
      if (item.pageCount != null && (!pages || pages.length === 0)) {
        failed.push(`${item.file.name}: choose at least one page.`)
        continue
      }
      try {
        batches.push({
          name: item.file.name,
          transactions: await parseStatementFile(item.file, accounts, pages),
        })
      } catch (caught) {
        failed.push(
          caught instanceof Error
            ? caught.message
            : item.file.name || 'one file',
        )
        batches.push({ name: item.file.name, transactions: [] })
      }
    }

    const { added } = importTransactions(batches)
    setProgress(null)
    setSelectedPages({})

    if (added > 0) navigate('/spending')
    if (added > 0 || failed.length > 0) {
      setMessage(
        spendingSummary(added, failed) ||
          'None of those files could be added.',
      )
    }
  }

  function onSpendingInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (files && files.length > 0) void handleSpendingFiles(files)
    event.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={onInputChange}
      />
      <input
        ref={spendingInputRef}
        type="file"
        accept="application/pdf,.pdf,.csv,text/csv,.ofx,.qfx"
        multiple
        className="sr-only"
        onChange={onSpendingInputChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={iconOnly ? 'ghost' : 'outline'}
            size={iconOnly ? 'icon' : 'sm'}
            disabled={busy}
            className={cn(iconOnly && 'hover-fill hover-fill-icon', className)}
            aria-label={
              progress
                ? `Reading ${progress.current}/${progress.total}`
                : 'Upload'
            }
          >
            <Upload data-icon={iconOnly ? undefined : 'inline-start'} />
            {iconOnly ? null : progress ? (
              `Reading ${progress.current}/${progress.total}…`
            ) : (
              'Upload'
            )}
            {iconOnly || progress ? null : (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={iconOnly ? 'end' : 'start'}>
          <DropdownMenuItem
            onSelect={() => {
              inputRef.current?.click()
            }}
          >
            Income
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              spendingInputRef.current?.click()
            }}
          >
            Spending
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={pendingStatements.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setPendingStatements([])
            setSelectedPages({})
          }
        }}
      >
        <DialogContent className="flex max-h-[min(36rem,calc(100vh-2rem))] w-[min(42rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-4 sm:max-w-[min(42rem,calc(100%-2rem))]">
          <DialogHeader className="pb-3">
            <DialogTitle>Choose pages</DialogTitle>
            <DialogDescription>
              Pick which pages to read from each statement.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="grid gap-3">
              {pendingStatements.map((item) => {
                const selected = selectedPages[item.id] ?? []
                return (
                  <div
                    key={item.id}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
                  >
                    <span className="min-w-0 break-words pt-1 [overflow-wrap:anywhere]">
                      {item.file.name}
                    </span>
                    {item.pageCount == null ? (
                      <span className="text-muted-foreground pt-1 text-sm">
                        All rows
                      </span>
                    ) : item.pageCount <= 0 ? (
                      <span className="text-muted-foreground pt-1 text-sm">
                        Could not read pages
                      </span>
                    ) : (
                      <div className="flex max-w-[16rem] flex-wrap justify-end gap-1">
                        {allPages(item.pageCount).map((page) => {
                          const on = selected.includes(page)
                          return (
                            <button
                              key={page}
                              type="button"
                              aria-pressed={on}
                              aria-label={`Page ${page}${on ? ', selected' : ''}`}
                              onClick={() => toggleStatementPage(item.id, page)}
                              className={cn(
                                'hover-fill flex size-7 items-center justify-center rounded-md text-sm tabular-nums',
                                on && 'hover-fill-active font-medium',
                              )}
                            >
                              {page}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingStatements([])
                setSelectedPages({})
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canImportStatements()}
              onClick={() => void importPendingStatements()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingStub != null}
        onOpenChange={(open) => {
          if (!open) setPendingStub(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate paycheck</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStub
                ? `A paycheck for ${formatLongDate(pendingStub.payDate)} is already saved. Skip this file or replace the existing one.`
                : 'This paycheck is already saved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStub(null)}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStub) upsertPaystub(pendingStub)
                setPendingStub(null)
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={message != null}
        onOpenChange={(open) => {
          if (!open) setMessage(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setMessage(null)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
