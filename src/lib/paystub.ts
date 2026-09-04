import { supabase } from '@/lib/supabase'

export type PayLine = {
  name: string
  amount: number
}

export type Paystub = {
  id: string
  fileName: string
  uploadedAt: string
  payDate: string
  periodBeginning?: string
  periodEnding?: string
  earnings: PayLine[]
  grossPay: number
  deductions: PayLine[]
  netPay: number
}

export type PdfTextItem = {
  str: string
  x: number
  y: number
  page?: number
}

const ROW_TOLERANCE = 2.5
const LABEL_MAX_X = 200
const PERIOD_MIN_X = 200
const PERIOD_MAX_X = 270

function isNumericFragment(text: string) {
  const value = text.trim().replace(/\*+$/, '')
  return /^-?\$?\d[\d,]*$/.test(value)
}

function parseAmount(fragments: string[]) {
  if (fragments.length === 0) return null
  const joined = fragments.join('').replace(/[$,*]/g, '')
  const negative = joined.includes('-')
  const digits = joined.replace(/-/g, '')
  if (!/^\d+$/.test(digits) || digits.length < 3) return null
  const value =
    Number.parseInt(digits.slice(0, -2), 10) +
    Number.parseInt(digits.slice(-2), 10) / 100
  return negative ? -value : value
}

function groupRows(items: PdfTextItem[]) {
  const sorted = [...items].sort(
    (left, right) =>
      (left.page ?? 0) - (right.page ?? 0) || right.y - left.y || left.x - right.x,
  )
  const rows: { y: number; page: number; items: PdfTextItem[] }[] = []

  for (const item of sorted) {
    const page = item.page ?? 0
    const row = rows.find(
      (entry) => entry.page === page && Math.abs(entry.y - item.y) <= ROW_TOLERANCE,
    )
    if (row) row.items.push(item)
    else rows.push({ y: item.y, page, items: [item] })
  }

  for (const row of rows) {
    row.items.sort((left, right) => left.x - right.x)
  }

  return rows
}

function rowLabel(items: PdfTextItem[]) {
  return items
    .filter((item) => item.x < LABEL_MAX_X && !isNumericFragment(item.str))
    .map((item) => item.str.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rowPeriodAmount(items: PdfTextItem[]) {
  return parseAmount(
    items
      .filter((item) => item.x >= PERIOD_MIN_X && item.x < PERIOD_MAX_X)
      .map((item) => item.str.trim()),
  )
}

function toIsoDate(text: string) {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return undefined
  return `${match[3]}-${match[1]}-${match[2]}`
}

function findLabeledDate(items: PdfTextItem[], label: string) {
  const needle = label.toLowerCase()
  const labelItem = items.find((item) =>
    item.str.toLowerCase().replace(':', '').includes(needle),
  )

  if (labelItem) {
    const neighbors = items
      .filter((item) => Math.abs(item.y - labelItem.y) <= 3 && item.x >= labelItem.x)
      .sort((left, right) => left.x - right.x)

    for (const item of neighbors) {
      const iso = toIsoDate(item.str)
      if (iso) return iso
    }
  }

  const blob = items.map((item) => item.str).join(' ')
  const match = blob.match(
    new RegExp(`${label.replace(':', '')}\\s*:?\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i'),
  )
  return match ? toIsoDate(match[1]) : undefined
}

function prettyName(name: string) {
  if (/^[A-Z]{2,4}$/.test(name)) return name
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) {
    return name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
  }
  return name
}

function isPerkLabel(label: string) {
  return /pick your/i.test(label)
}

function isDepositLabel(label: string) {
  return /^(checking|savings|direct deposit)\b/i.test(label)
}

function isSectionHeader(label: string) {
  return /^(statutory|other benefits|rate|this period|year to date|page\b)/i.test(
    label,
  )
}

export function parseAdpPaystub(items: PdfTextItem[]): Omit<
  Paystub,
  'id' | 'fileName' | 'uploadedAt'
> {
  const rows = groupRows(items)
  const earnings: PayLine[] = []
  const deductions: PayLine[] = []
  let perkAmount = 0
  let section: 'start' | 'earnings' | 'deductions' | 'done' = 'start'
  let grossPay = 0
  let netPay = 0

  for (const row of rows) {
    const label = rowLabel(row.items)
    const amount = rowPeriodAmount(row.items)
    if (!label) continue

    if (/^regular\b/i.test(label) && amount != null) {
      section = 'earnings'
      earnings.push({ name: 'Regular', amount })
      continue
    }

    if (isPerkLabel(label) && amount != null) {
      if (section === 'earnings' && amount > 0) perkAmount = amount
      continue
    }

    if (/gross pay/i.test(label) && amount != null) {
      grossPay = amount
      section = 'deductions'
      continue
    }

    if (/net pay/i.test(label) && amount != null) {
      netPay = amount
      section = 'done'
      continue
    }

    if (
      section === 'deductions' &&
      amount != null &&
      amount !== 0 &&
      !isSectionHeader(label) &&
      !isDepositLabel(label) &&
      !isPerkLabel(label)
    ) {
      deductions.push({ name: prettyName(label), amount })
    }
  }

  const payDate = findLabeledDate(items, 'pay date')
  if (!payDate || earnings.length === 0 || !grossPay || !netPay) {
    throw new Error(
      'Could not read this ADP paystub. Use the earnings statement PDF from ADP.',
    )
  }

  return {
    payDate,
    periodBeginning: findLabeledDate(items, 'period beginning'),
    periodEnding: findLabeledDate(items, 'period ending'),
    earnings,
    grossPay: grossPay - perkAmount,
    deductions,
    netPay,
  }
}

const STORAGE_KEY = 'mybudget.paystubs.v1'

/** Hidden paystubs row that stores budget + planner for cloud sync. */
export const APP_STATE_PAY_DATE = '1970-01-01'

export function isAppStatePayDate(payDate: string) {
  return payDate === APP_STATE_PAY_DATE
}

export function isAppStateRecord(value: unknown) {
  if (value == null || typeof value !== 'object') return false
  const row = value as { payDate?: string; appState?: unknown; fileName?: string }
  return (
    row.appState === true ||
    row.payDate === APP_STATE_PAY_DATE ||
    row.fileName === '__app_state__'
  )
}

function isPaystubLike(value: unknown): value is Paystub {
  if (value == null || typeof value !== 'object') return false
  const row = value as Partial<Paystub>
  return typeof row.payDate === 'string' && Array.isArray(row.earnings)
}

function incomePaystubs(values: unknown[]) {
  return values
    .filter((row): row is Paystub => isPaystubLike(row) && !isAppStateRecord(row))
    .map(stripPerk)
}

function stripPerk(paystub: Paystub): Paystub {
  const perkTotal = paystub.earnings
    .filter((line) => isPerkLabel(line.name))
    .reduce((sum, line) => sum + line.amount, 0)

  return {
    ...paystub,
    earnings: paystub.earnings.filter((line) => !isPerkLabel(line.name)),
    deductions: paystub.deductions.filter((line) => !isPerkLabel(line.name)),
    grossPay: paystub.grossPay - perkTotal,
  }
}

export function loadPaystubs(): Paystub[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const paystubs = incomePaystubs(parsed)
    savePaystubs(paystubs)
    return paystubs
  } catch {
    return []
  }
}

export function savePaystubs(paystubs: Paystub[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(paystubs.filter((row) => !isAppStateRecord(row))),
  )
}

type PaystubRow = {
  data: unknown
}

let paystubsUserIdColumn: 'unknown' | 'yes' | 'no' = 'unknown'

function isMissingUserIdColumn(error: { code?: string; message: string }) {
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    (/user_id/i.test(error.message) &&
      /does not exist|schema cache/i.test(error.message))
  )
}

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function fetchPaystubDataByDate(
  payDate: string,
): Promise<unknown | null> {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) return null

  if (paystubsUserIdColumn === 'yes') {
    const { data, error } = await supabase
      .from('paystubs')
      .select('data')
      .eq('user_id', userId)
      .eq('pay_date', payDate)
      .maybeSingle()
    if (error) {
      console.error(error.message)
      return null
    }
    return (data as PaystubRow | null)?.data ?? null
  }

  const { data, error } = await supabase
    .from('paystubs')
    .select('data')
    .eq('pay_date', payDate)
    .maybeSingle()
  if (!error) {
    paystubsUserIdColumn = 'no'
    return (data as PaystubRow | null)?.data ?? null
  }
  if (!isMissingUserIdColumn(error) && paystubsUserIdColumn === 'no') {
    console.error(error.message)
    return null
  }

  const scoped = await supabase
    .from('paystubs')
    .select('data')
    .eq('user_id', userId)
    .eq('pay_date', payDate)
    .maybeSingle()
  if (scoped.error) {
    console.error(scoped.error.message)
    return null
  }
  paystubsUserIdColumn = 'yes'
  return (scoped.data as PaystubRow | null)?.data ?? null
}

export async function upsertPaystubRecord(
  id: string,
  payDate: string,
  data: unknown,
) {
  if (!supabase) return
  const userId = await currentUserId()
  if (!userId) return
  const row = {
    id,
    pay_date: payDate,
    data,
    updated_at: new Date().toISOString(),
  }

  if (paystubsUserIdColumn !== 'yes') {
    const { error } = await supabase
      .from('paystubs')
      .upsert(row, { onConflict: 'pay_date' })
    if (!error) {
      paystubsUserIdColumn = 'no'
      return
    }
    if (paystubsUserIdColumn === 'no' || isMissingUserIdColumn(error)) {
      console.error(error.message)
      return
    }
  }

  const { error } = await supabase.from('paystubs').upsert(
    { ...row, user_id: userId },
    { onConflict: 'user_id,pay_date' },
  )
  if (error) {
    console.error(error.message)
    return
  }
  paystubsUserIdColumn = 'yes'
}

export async function fetchRemotePaystubs(): Promise<Paystub[] | null> {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) return null

  if (paystubsUserIdColumn === 'yes') {
    const { data, error } = await supabase
      .from('paystubs')
      .select('data')
      .eq('user_id', userId)
    if (error) {
      console.error(error.message)
      return null
    }
    return incomePaystubs(((data ?? []) as PaystubRow[]).map((row) => row.data))
  }

  const { data, error } = await supabase.from('paystubs').select('data')
  if (!error) {
    paystubsUserIdColumn = 'no'
    return incomePaystubs(((data ?? []) as PaystubRow[]).map((row) => row.data))
  }
  if (!isMissingUserIdColumn(error) && paystubsUserIdColumn === 'no') {
    console.error(error.message)
    return null
  }

  const scoped = await supabase
    .from('paystubs')
    .select('data')
    .eq('user_id', userId)
  if (scoped.error) {
    console.error(scoped.error.message)
    return null
  }
  paystubsUserIdColumn = 'yes'
  return incomePaystubs(
    ((scoped.data ?? []) as PaystubRow[]).map((row) => row.data),
  )
}

export async function upsertRemotePaystub(paystub: Paystub) {
  if (!supabase || isAppStateRecord(paystub)) return
  await upsertPaystubRecord(paystub.id, paystub.payDate, paystub)
}

export async function deleteRemotePaystub(id: string) {
  if (!supabase) return
  const userId = await currentUserId()
  if (!userId) return
  const { error } = await supabase.from('paystubs').delete().eq('id', id)
  if (error) console.error(error.message)
}
