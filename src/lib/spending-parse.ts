import type { BankAccount } from '@/lib/budget'
import type { PdfTextItem } from '@/lib/paystub'
import type { NewSpendingTxn } from '@/lib/spending'

const ROW_TOLERANCE = 3
const MONEY_RE =
  /\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?(?:\s*(?:CR|DR|Cr|Dr))?/g
const DATE_RE = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g
const SKIP_DESC =
  /^(beginning|ending) balance|^total\b|^page\b|statement period|continued on|average ledger|^date\b|^description\b|^amount\b|^balance\b|overdraft protection|^checks paid|^deposits and credits|^withdrawals and debits/i

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function isoDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseYear(year: number) {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year
  return year
}

function parseSlashDate(text: string, fallbackYear: number | null) {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = match[3]
    ? parseYear(Number(match[3]))
    : (fallbackYear ?? new Date().getFullYear())
  return isoDate(year, month, day)
}

function parseIsoLikeDate(text: string) {
  const iso = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const compact = text.trim().match(/^(\d{4})(\d{2})(\d{2})/)
  if (compact) {
    return isoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]))
  }
  return null
}

function parseAnyDate(text: string, fallbackYear: number | null) {
  return parseSlashDate(text, fallbackYear) ?? parseIsoLikeDate(text)
}

function parseMoneyToken(text: string) {
  const compact = text.replace(/\s+/g, '')
  const credit =
    /\(.*\)/.test(compact) || /CR$/i.test(compact) || compact.includes('-')
  const digits = compact.replace(/[^0-9.]/g, '')
  if (!digits) return null
  const amount = Number.parseFloat(digits)
  if (!Number.isFinite(amount)) return null
  return credit ? -amount : amount
}

function normalizeRow(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/\$\s+/g, '$')
    .replace(/\s+,/g, ',')
    .trim()
}

function groupRows(items: PdfTextItem[]) {
  const sorted = [...items].sort(
    (left, right) => right.y - left.y || left.x - right.x,
  )
  const rows: { y: number; items: PdfTextItem[] }[] = []
  for (const item of sorted) {
    const row = rows.find((entry) => Math.abs(entry.y - item.y) <= ROW_TOLERANCE)
    if (row) row.items.push(item)
    else rows.push({ y: item.y, items: [item] })
  }
  for (const row of rows) {
    row.items.sort((left, right) => left.x - right.x)
  }
  return rows.map((row) =>
    normalizeRow(row.items.map((item) => item.str).join(' ')),
  )
}

export function guessSpendingAccountId(
  fileName: string,
  text: string,
  accounts: BankAccount[],
) {
  const hay = `${fileName} ${text}`.toLowerCase()
  for (const account of accounts) {
    if (account.lastFour && hay.includes(account.lastFour)) return account.id
  }
  if (/bank of america|\bbofa\b|\bboa\b/.test(hay)) {
    return (
      accounts.find((account) => account.id === 'bofa-checking')?.id ??
      fallbackAccountId(accounts)
    )
  }
  if (/discover/.test(hay)) {
    return (
      accounts.find((account) => account.id === 'discover-checking')?.id ??
      fallbackAccountId(accounts)
    )
  }
  return fallbackAccountId(accounts)
}

function fallbackAccountId(accounts: BankAccount[]) {
  return (
    accounts.find((account) => account.role === 'bills')?.id ??
    accounts.find((account) => account.kind === 'checking')?.id ??
    accounts[0]?.id ??
    ''
  )
}

function statementYear(lines: string[]) {
  const head = lines.slice(0, 40).join(' ')
  const years = [...head.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1]),
  )
  return years[0] ?? null
}

type Polarity = 'debit' | 'credit' | 'unknown'

function sectionPolarity(line: string): Polarity | null {
  if (
    /deposits and credits|other deposits|electronic deposits|atm deposits/i.test(
      line,
    )
  ) {
    return 'credit'
  }
  if (
    /withdrawals and debits|card purchases|checks paid|electronic payments|fees and charges|atm withdrawals/i.test(
      line,
    )
  ) {
    return 'debit'
  }
  return null
}

function signedPdfAmount(raw: number, polarity: Polarity) {
  const abs = Math.abs(raw)
  if (raw < 0 || polarity === 'credit') return -abs
  return abs
}

function parsePdfLine(
  line: string,
  accountId: string,
  sourceFile: string,
  year: number | null,
  polarity: Polarity,
): NewSpendingTxn | null {
  const dateMatches = [...line.matchAll(DATE_RE)]
  if (dateMatches.length === 0) return null
  const date = parseSlashDate(dateMatches[0][1], year)
  if (!date) return null

  const money = [...line.matchAll(MONEY_RE)]
    .map((match) => ({ text: match[0], index: match.index ?? 0 }))
    .filter((item) => /[.]/.test(item.text) || /CR|DR/i.test(item.text))
  if (money.length === 0) return null

  const amountToken =
    money.length >= 2 ? money[money.length - 2] : money[money.length - 1]
  const rawAmount = parseMoneyToken(amountToken.text)
  if (rawAmount == null || Math.abs(rawAmount) < 0.005) return null

  const dateMatch = dateMatches[dateMatches.length > 1 ? 1 : 0]
  const dateEnd = (dateMatch.index ?? 0) + dateMatch[0].length
  let description = line.slice(dateEnd, amountToken.index).trim()
  description = description.replace(/^[.\-–—]+\s*/, '').replace(/\s+/g, ' ')
  if (!description || SKIP_DESC.test(description)) return null

  return {
    date,
    description,
    merchant: description,
    accountId,
    amount: signedPdfAmount(rawAmount, polarity),
    sourceFile,
  }
}

function parsePdfLines(
  lines: string[],
  accountId: string,
  sourceFile: string,
): NewSpendingTxn[] {
  const year = statementYear(lines)
  let polarity: Polarity = 'unknown'
  const parsed: NewSpendingTxn[] = []

  for (const line of lines) {
    const nextPolarity = sectionPolarity(line)
    if (nextPolarity) {
      polarity = nextPolarity
      continue
    }
    const txn = parsePdfLine(line, accountId, sourceFile, year, polarity)
    if (txn) parsed.push(txn)
  }
  return parsed
}

function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const options: [string, number][] = [
    [',', (first.match(/,/g) ?? []).length],
    ['\t', (first.match(/\t/g) ?? []).length],
    [';', (first.match(/;/g) ?? []).length],
  ]
  options.sort((left, right) => right[1] - left[1])
  return options[0][1] > 0 ? options[0][0] : ','
}

function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((entry) => entry.some((value) => value.trim()))
}

function headerIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(header))
}

function parseCsvAmount(value: string) {
  const parsed = parseMoneyToken(value)
  return parsed
}

function parseCsvRows(
  text: string,
  accountId: string,
  sourceFile: string,
): NewSpendingTxn[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) return []
  const headers = rows[0].map((value) => value.trim().toLowerCase())
  const dateIndex = headerIndex(headers, [
    'date',
    'transaction date',
    'trans. date',
    'trans date',
    'posted date',
    'post date',
    'posting date',
  ])
  const descIndex = headerIndex(headers, [
    'description',
    'memo',
    'name',
    'payee',
    'merchant',
    'transaction',
  ])
  const amountIndex = headerIndex(headers, ['amount', 'transaction amount'])
  const debitIndex = headerIndex(headers, ['debit', 'withdrawal', 'withdrawals'])
  const creditIndex = headerIndex(headers, ['credit', 'deposit', 'deposits'])
  if (dateIndex < 0 || descIndex < 0) return []
  if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) return []

  const parsed: NewSpendingTxn[] = []
  for (const row of rows.slice(1)) {
    const date = parseAnyDate(row[dateIndex] ?? '', null)
    const description = (row[descIndex] ?? '').replace(/\s+/g, ' ').trim()
    if (!date || !description || SKIP_DESC.test(description)) continue

    let amount: number | null = null
    if (debitIndex >= 0 || creditIndex >= 0) {
      const debit = parseCsvAmount(row[debitIndex] ?? '')
      const credit = parseCsvAmount(row[creditIndex] ?? '')
      if (debit != null && Math.abs(debit) > 0.005) amount = Math.abs(debit)
      else if (credit != null && Math.abs(credit) > 0.005) amount = -Math.abs(credit)
    } else {
      const raw = parseCsvAmount(row[amountIndex] ?? '')
      if (raw != null) amount = -raw
    }
    if (amount == null || Math.abs(amount) < 0.005) continue
    parsed.push({
      date,
      description,
      merchant: description,
      accountId,
      amount,
      sourceFile,
    })
  }
  return parsed
}

function ofxTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseOfx(
  text: string,
  accountId: string,
  sourceFile: string,
): NewSpendingTxn[] {
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  const parsed: NewSpendingTxn[] = []
  for (const block of blocks) {
    const date = parseIsoLikeDate(ofxTag(block, 'DTPOSTED'))
    const raw = Number.parseFloat(ofxTag(block, 'TRNAMT').replace(/,/g, ''))
    const description = (ofxTag(block, 'NAME') || ofxTag(block, 'MEMO')).replace(
      /\s+/g,
      ' ',
    )
    if (!date || !description || !Number.isFinite(raw) || Math.abs(raw) < 0.005) {
      continue
    }
    parsed.push({
      date,
      description,
      merchant: description,
      accountId,
      amount: -raw,
      sourceFile,
    })
  }
  return parsed
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isCsv(file: File) {
  const name = file.name.toLowerCase()
  return (
    file.type === 'text/csv' ||
    file.type === 'text/plain' ||
    name.endsWith('.csv') ||
    name.endsWith('.txt')
  )
}

export async function parseStatementFile(
  file: File,
  accounts: BankAccount[],
): Promise<NewSpendingTxn[]> {
  const sourceFile = file.name
  if (isPdf(file)) {
    const { extractPdfTextItems } = await import('@/lib/extract-pdf')
    const items = await extractPdfTextItems(file)
    const lines = groupRows(items)
    const accountId = guessSpendingAccountId(
      file.name,
      lines.slice(0, 40).join(' '),
      accounts,
    )
    const parsed = parsePdfLines(lines, accountId, sourceFile)
    if (parsed.length === 0) {
      throw new Error(
        `${file.name}: no transactions found. A CSV or OFX export from the bank usually works better.`,
      )
    }
    return parsed
  }

  const text = await file.text()
  const accountId = guessSpendingAccountId(file.name, text.slice(0, 4000), accounts)
  const name = file.name.toLowerCase()
  if (
    name.endsWith('.ofx') ||
    name.endsWith('.qfx') ||
    /<STMTTRN>/i.test(text)
  ) {
    const parsed = parseOfx(text, accountId, sourceFile)
    if (parsed.length === 0) {
      throw new Error(`${file.name}: no transactions found in that OFX file.`)
    }
    return parsed
  }

  if (isCsv(file)) {
    const parsed = parseCsvRows(text, accountId, sourceFile)
    if (parsed.length === 0) {
      throw new Error(
        `${file.name}: no transactions found. Use a CSV with Date, Description, and Amount columns.`,
      )
    }
    return parsed
  }

  throw new Error(`${file.name} is not a PDF, CSV, or OFX statement.`)
}
