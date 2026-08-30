import { useRef, useState, type ChangeEvent } from 'react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatLongDate } from '@/lib/format'
import { parseAdpPaystub, type Paystub } from '@/lib/paystub'
import { usePaystubs } from '@/lib/paystub-context'

const MAX_PAYSTUB_FILES = 20

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

export function PaystubUploadButton() {
  const { paystubs, upsertPaystub } = usePaystubs()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [pendingStub, setPendingStub] = useState<Paystub | null>(null)
  const [expensesSoon, setExpensesSoon] = useState(false)

  const busy = progress != null

  async function handleFiles(fileList: FileList) {
    const files = [...fileList]
    if (files.length === 0) return

    if (files.length > MAX_PAYSTUB_FILES) {
      setMessage(`Upload up to ${MAX_PAYSTUB_FILES} PDFs at a time.`)
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy}>
            <Upload data-icon="inline-start" />
            {progress
              ? `Reading ${progress.current}/${progress.total}…`
              : 'Upload'}
            {progress ? null : (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              inputRef.current?.click()
            }}
          >
            Income
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setExpensesSoon(true)}>
            Expenses
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

      <AlertDialog
        open={expensesSoon}
        onOpenChange={setExpensesSoon}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Expenses</AlertDialogTitle>
            <AlertDialogDescription>
              Bank statement upload is next. For now, expenses stay on the
              expenses page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setExpensesSoon(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
