const STORAGE_KEY = 'mybudget.spending.v1'

export type SpendingTxn = {
  id: string
  date: string
  description: string
  merchant: string
  accountId: string
  /** Money out is positive; deposits/credits are negative. */
  amount: number
  sourceFile?: string
  /** When true, rename rules leave `merchant` alone. */
  customName?: boolean
  updatedAt?: string
}

export type SpendingRule = {
  id: string
  match: string
  merchant: string
  updatedAt?: string
}

export type SpendingState = {
  transactions: SpendingTxn[]
  rules: SpendingRule[]
}

export function emptySpending(): SpendingState {
  return { transactions: [], rules: [] }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stamp(value: string | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  return `${match[1]}-${match[2]}-${match[3]}`
}

function normalizeTxn(value: unknown): SpendingTxn | null {
  const row = asRecord(value)
  if (!row) return null
  const date = normalizeIsoDate(row.date)
  const description =
    typeof row.description === 'string' ? row.description.trim() : ''
  const merchant =
    typeof row.merchant === 'string' && row.merchant.trim()
      ? row.merchant.trim()
      : description
  const accountId = typeof row.accountId === 'string' ? row.accountId : ''
  const amount =
    typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : null
  const id = typeof row.id === 'string' && row.id ? row.id : null
  if (!date || !id || amount == null || !description) return null
  const updatedAt =
    typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : undefined
  const sourceFile =
    typeof row.sourceFile === 'string' && row.sourceFile
      ? row.sourceFile
      : undefined
  return {
    id,
    date,
    description,
    merchant,
    accountId,
    amount,
    ...(sourceFile ? { sourceFile } : {}),
    ...(row.customName === true ? { customName: true } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function normalizeRule(value: unknown): SpendingRule | null {
  const row = asRecord(value)
  if (!row) return null
  const id = typeof row.id === 'string' && row.id ? row.id : null
  const match = typeof row.match === 'string' ? row.match.trim() : ''
  const merchant = typeof row.merchant === 'string' ? row.merchant.trim() : ''
  if (!id || !match || !merchant) return null
  const updatedAt =
    typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : undefined
  return { id, match, merchant, ...(updatedAt ? { updatedAt } : {}) }
}

export function parseSpendingState(value: unknown): SpendingState | null {
  const row = asRecord(value)
  if (!row || !Array.isArray(row.transactions) || !Array.isArray(row.rules)) {
    return null
  }
  return {
    transactions: row.transactions
      .map(normalizeTxn)
      .filter((item): item is SpendingTxn => item != null),
    rules: row.rules
      .map(normalizeRule)
      .filter((item): item is SpendingRule => item != null),
  }
}

export function loadSpending(): SpendingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptySpending()
    return parseSpendingState(JSON.parse(raw)) ?? emptySpending()
  } catch {
    return emptySpending()
  }
}

export function saveSpending(state: SpendingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function spendingFingerprint(txn: {
  date: string
  amount: number
  description: string
  accountId: string
}) {
  return [
    txn.date,
    txn.amount.toFixed(2),
    txn.description.replace(/\s+/g, ' ').trim().toLowerCase(),
    txn.accountId,
  ].join('|')
}

export function descriptionMatchesRule(description: string, match: string) {
  const needle = match.trim().toLowerCase()
  if (!needle) return false
  return description.toLowerCase().includes(needle)
}

export function merchantFromRules(description: string, rules: SpendingRule[]) {
  const hits = rules.filter((rule) =>
    descriptionMatchesRule(description, rule.match),
  )
  if (hits.length === 0) return null
  return [...hits].sort((left, right) => right.match.trim().length - left.match.trim().length)[0]
    .merchant
}

export function applySpendingRules(
  transactions: SpendingTxn[],
  rules: SpendingRule[],
): SpendingTxn[] {
  return transactions.map((txn) => {
    if (txn.customName) return txn
    const merchant = merchantFromRules(txn.description, rules) ?? txn.description
    if (merchant === txn.merchant) return txn
    return { ...txn, merchant }
  })
}

function mergeById<T extends { id: string; updatedAt?: string }>(
  left: T[],
  right: T[],
) {
  const merged = new Map<string, T>()
  for (const item of [...left, ...right]) {
    const existing = merged.get(item.id)
    if (!existing || stamp(item.updatedAt) >= stamp(existing.updatedAt)) {
      merged.set(item.id, item)
    }
  }
  return [...merged.values()]
}

export function mergeSpending(
  remote: SpendingState,
  local: SpendingState,
): SpendingState {
  return {
    transactions: mergeById(remote.transactions, local.transactions),
    rules: mergeById(remote.rules, local.rules),
  }
}

export function sortSpendingTxns(transactions: SpendingTxn[]) {
  return [...transactions].sort((left, right) => {
    const byDate = right.date.localeCompare(left.date)
    if (byDate !== 0) return byDate
    const byMerchant = left.merchant.localeCompare(right.merchant)
    if (byMerchant !== 0) return byMerchant
    return left.id.localeCompare(right.id)
  })
}

export type NewSpendingTxn = Omit<SpendingTxn, 'id' | 'updatedAt'>

export function importSpendingTxns(
  current: SpendingState,
  incoming: NewSpendingTxn[],
) {
  const known = new Set(
    current.transactions.map((txn) => spendingFingerprint(txn)),
  )
  const added: SpendingTxn[] = []
  let skipped = 0
  const now = new Date().toISOString()

  for (const item of incoming) {
    const next: SpendingTxn = {
      ...item,
      id: crypto.randomUUID(),
      updatedAt: now,
    }
    const key = spendingFingerprint(next)
    if (known.has(key)) {
      skipped += 1
      continue
    }
    known.add(key)
    added.push(next)
  }

  return {
    state: {
      ...current,
      transactions: applySpendingRules(
        [...current.transactions, ...added],
        current.rules,
      ),
    },
    added: added.length,
    skipped,
  }
}
