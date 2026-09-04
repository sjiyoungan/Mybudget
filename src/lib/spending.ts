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
  /** Statement upload that created this row. */
  uploadId?: string
  categoryId?: string
  /** When true, rename rules leave `merchant` alone. */
  customName?: boolean
  /** When true, rename rules leave `categoryId` alone. */
  customCategory?: boolean
  updatedAt?: string
}

export type SpendingCategory = {
  id: string
  name: string
  /** Recurring expense lines this category is budgeted against. */
  expenseIds?: string[]
  /** @deprecated Migrated into `expenseIds`. */
  expenseId?: string
  /** Parent group. Set on specific categories under a group. */
  parentId?: string
  /** Budget allotted to a child category, in dollars. */
  budget?: number
  /** Created with Add category so several expenses can share this name. */
  grouped?: boolean
  /** When false, hidden from the pie and categorize options. */
  enabled?: boolean
  updatedAt?: string
}

export function isActiveSpendingCategory(category: SpendingCategory) {
  if (category.grouped) return true
  return category.enabled !== false
}

export function categoryExpenseIds(category: SpendingCategory) {
  const ids: string[] = []
  for (const id of category.expenseIds ?? []) {
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (category.expenseId && !ids.includes(category.expenseId)) {
    ids.push(category.expenseId)
  }
  return ids
}

export function isSpendingChildCategory(category: SpendingCategory) {
  return Boolean(category.parentId)
}

export function isGroupedSpendingCategory(category: SpendingCategory) {
  if (category.parentId) return false
  return category.grouped === true || categoryExpenseIds(category).length !== 1
}

export function visibleSpendingCategories(categories: SpendingCategory[]) {
  const groupedExpenseIds = new Set(
    categories
      .filter(
        (item) =>
          isActiveSpendingCategory(item) && isGroupedSpendingCategory(item),
      )
      .flatMap(categoryExpenseIds),
  )
  return categories.filter((item) => {
    if (item.parentId) return false
    if (!isActiveSpendingCategory(item)) return false
    if (isGroupedSpendingCategory(item)) return true
    return !categoryExpenseIds(item).some((id) => groupedExpenseIds.has(id))
  })
}

export function spendingCategoriesForExpense(
  expenseId: string,
  categories: SpendingCategory[],
) {
  return visibleSpendingCategories(categories).filter((item) =>
    categoryExpenseIds(item).includes(expenseId),
  )
}

export function spendingBucketIdForExpense(
  expenseId: string,
  categories: SpendingCategory[],
) {
  const grouped = categories.find(
    (item) =>
      isActiveSpendingCategory(item) &&
      isGroupedSpendingCategory(item) &&
      categoryExpenseIds(item).includes(expenseId),
  )
  if (grouped) return grouped.id
  const match = categories.find(
    (item) =>
      isActiveSpendingCategory(item) &&
      categoryExpenseIds(item).includes(expenseId),
  )
  return match?.id ?? ''
}

export function applyExpenseSpendingBuckets(
  categories: SpendingCategory[],
  assignments: ReadonlyMap<string, string>,
): SpendingCategory[] {
  const assignedBucketIds = new Set(
    [...assignments.values()].filter((id) => id.length > 0),
  )
  return categories.map((item) => {
    if (item.parentId) {
      return {
        id: item.id,
        name: item.name,
        parentId: item.parentId,
        ...(item.budget != null ? { budget: item.budget } : {}),
        ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
      }
    }
    const remaining = categoryExpenseIds(item).filter((id) => {
      if (!assignments.has(id)) return true
      return assignments.get(id) === item.id
    })
    const added = [...assignments.entries()]
      .filter(([, bucketId]) => bucketId === item.id)
      .map(([expenseId]) => expenseId)
    const ids = [...new Set([...remaining, ...added])]
    const enabled = assignedBucketIds.has(item.id)
      ? true
      : ids.length === 0 && item.grouped !== true
        ? false
        : item.enabled !== false
    return {
      id: item.id,
      name: item.name,
      ...(ids.length > 0 ? { expenseIds: ids } : {}),
      ...(item.grouped ? { grouped: true } : {}),
      ...(enabled ? {} : { enabled: false }),
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
    }
  })
}

export function rolledSpendingCategoryId(
  categoryId: string | undefined,
  categories: SpendingCategory[],
) {
  if (!categoryId) return undefined
  const current = categories.find((item) => item.id === categoryId)
  if (current?.parentId) {
    const parent = categories.find((item) => item.id === current.parentId)
    if (parent && isActiveSpendingCategory(parent)) return parent.id
  }
  const expenseIds = current ? categoryExpenseIds(current) : []
  const group = categories.find(
    (item) =>
      isActiveSpendingCategory(item) &&
      isGroupedSpendingCategory(item) &&
      categoryExpenseIds(item).some((id) => expenseIds.includes(id)),
  )
  if (group) return group.id
  return categoryId
}

export type SpendingRule = {
  id: string
  match: string
  merchant: string
  categoryId?: string
  updatedAt?: string
}

export type SpendingUpload = {
  id: string
  name: string
  uploadedAt: string
}

export type SpendingState = {
  transactions: SpendingTxn[]
  rules: SpendingRule[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  updatedAt?: string
}

export function emptySpending(): SpendingState {
  return { transactions: [], rules: [], categories: [], uploads: [] }
}

export function toSentenceCase(text: string) {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  return collapsed.toLowerCase().replace(/^\p{L}/u, (ch) => ch.toUpperCase())
}

const COLUMN_TAIL =
  /\s+(?:new balance|total posted|posted date|post date|interest charge|payments? and credits?|previous balance|minimum payment|credit limit|available credit)\b[\s\S]*$/i

export function cleanMerchantName(text: string) {
  let value = text.replace(/\s+/g, ' ').trim()
  value = value.replace(COLUMN_TAIL, '')
  value = value.replace(
    /\binterest charges?(?:,)?(?:\s+and)?(?:\s+purchases?)?\b/gi,
    '',
  )
  value = value.replace(
    /^(?:check card purchase|debit card purchase|ach deposit|ach withdrawal|ach debit|direct deposit|electronic deposit|electronic withdrawal|interest paid)\s+/i,
    '',
  )
  value = value.replace(/,?\s+[A-Za-z .'-]+,\s+[A-Z]{2},\s+US$/i, '')
  value = value.replace(/\bpurchases?\s*$/i, '')
  value = value.replace(/[.,;:]+$/g, '').replace(/\s+/g, ' ').trim()
  return toSentenceCase(value)
}

function spendingHay(txn: Pick<SpendingTxn, 'description' | 'merchant'>) {
  return `${txn.description} ${txn.merchant}`.toLowerCase()
}

export function isInterestTxn(txn: Pick<SpendingTxn, 'description' | 'merchant'>) {
  return /\binterest\b|\bfinance charge\b|\bint(?:erest)?\s*chg\b|\bint charge\b/.test(
    spendingHay(txn),
  )
}

export function isTransferTxn(txn: Pick<SpendingTxn, 'description' | 'merchant'>) {
  return /\btransfer\b|\bxfer\b|\btrnsfr\b|\bkeep the change\b|\bbetween (?:my )?accounts\b|\bfrom (?:checking|savings|brokerage)\b|\bto (?:checking|savings|brokerage)\b|\binternal transfer\b|\bfunds transfer\b|\baccount transfer\b/.test(
    spendingHay(txn),
  )
}

export function isDepositTxn(
  txn: Pick<SpendingTxn, 'description' | 'merchant' | 'amount'>,
) {
  if (isTransferTxn(txn)) return false
  if (txn.amount < 0) {
    return /\bdeposit\b|\bdirect dep(?:osit)?\b|\bppayroll\b|\bach credit\b|\bpaycheck\b|\bsalary\b|\bincome\b/.test(
      spendingHay(txn),
    )
  }
  return /\bdeposit\b|\bdirect dep(?:osit)?\b/.test(spendingHay(txn))
}

export function isJunkStatementTxn(
  txn: Pick<SpendingTxn, 'description' | 'merchant'>,
) {
  const hay = spendingHay(txn)
  return (
    /suspected error|describe the error|dollar amount of the suspected|xxxxxx\d+|spending account check card|to receive prompt credit|regulatory requirement/.test(
      hay,
    )
  )
}

/** Purchases that count toward spending totals (excludes interest, transfers, deposits). */
export function isSpendingPurchase(
  txn: Pick<SpendingTxn, 'description' | 'merchant' | 'amount'>,
) {
  if (txn.amount <= 0) return false
  if (isJunkStatementTxn(txn)) return false
  if (isInterestTxn(txn)) return false
  if (isTransferTxn(txn)) return false
  if (isDepositTxn(txn)) return false
  return true
}

export function displayMerchant(txn: SpendingTxn, rules: SpendingRule[] = []) {
  if (txn.customName) return toSentenceCase(txn.merchant)
  const rule = matchingSpendingRule(txn.description, rules)
  if (rule) return toSentenceCase(rule.merchant)
  return cleanMerchantName(txn.description) || toSentenceCase(txn.merchant)
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
  const rawMerchant =
    typeof row.merchant === 'string' && row.merchant.trim()
      ? row.merchant.trim()
      : description
  const customName = row.customName === true
  const merchant = customName
    ? toSentenceCase(rawMerchant)
    : cleanMerchantName(rawMerchant) || toSentenceCase(rawMerchant)
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
  const uploadId =
    typeof row.uploadId === 'string' && row.uploadId ? row.uploadId : undefined
  return {
    id,
    date,
    description,
    merchant,
    accountId,
    amount,
    ...(sourceFile ? { sourceFile } : {}),
    ...(uploadId ? { uploadId } : {}),
    ...(typeof row.categoryId === 'string' && row.categoryId
      ? { categoryId: row.categoryId }
      : {}),
    ...(customName ? { customName: true } : {}),
    ...(row.customCategory === true ? { customCategory: true } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function normalizeCategory(value: unknown): SpendingCategory | null {
  const row = asRecord(value)
  if (!row) return null
  const id = typeof row.id === 'string' && row.id ? row.id : null
  const name = typeof row.name === 'string' ? toSentenceCase(row.name) : ''
  if (!id || !name) return null
  const updatedAt =
    typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : undefined
  const expenseIds = categoryExpenseIds({
    id,
    name,
    expenseIds: Array.isArray(row.expenseIds)
      ? row.expenseIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    expenseId:
      typeof row.expenseId === 'string' && row.expenseId
        ? row.expenseId
        : undefined,
  })
  const parentId =
    typeof row.parentId === 'string' && row.parentId ? row.parentId : undefined
  const budget =
    typeof row.budget === 'number' && Number.isFinite(row.budget)
      ? row.budget
      : undefined
  return {
    id,
    name,
    ...(expenseIds.length > 0 ? { expenseIds } : {}),
    ...(parentId ? { parentId } : {}),
    ...(budget != null ? { budget } : {}),
    ...(row.grouped === true ? { grouped: true } : {}),
    ...(row.enabled === false ? { enabled: false } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function normalizeRule(value: unknown): SpendingRule | null {
  const row = asRecord(value)
  if (!row) return null
  const id = typeof row.id === 'string' && row.id ? row.id : null
  const match = typeof row.match === 'string' ? row.match.trim() : ''
  const merchant =
    typeof row.merchant === 'string' ? toSentenceCase(row.merchant) : ''
  if (!id || !match || !merchant) return null
  const updatedAt =
    typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : undefined
  const categoryId =
    typeof row.categoryId === 'string' && row.categoryId
      ? row.categoryId
      : undefined
  return {
    id,
    match,
    merchant,
    ...(categoryId ? { categoryId } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function normalizeUpload(value: unknown): SpendingUpload | null {
  const row = asRecord(value)
  if (!row) return null
  const id = typeof row.id === 'string' && row.id ? row.id : null
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!id || !name) return null
  const uploadedAt =
    typeof row.uploadedAt === 'string' && row.uploadedAt
      ? row.uploadedAt
      : new Date().toISOString()
  return { id, name, uploadedAt }
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
    categories: Array.isArray(row.categories)
      ? row.categories
          .map(normalizeCategory)
          .filter((item): item is SpendingCategory => item != null)
      : [],
    uploads: Array.isArray(row.uploads)
      ? row.uploads
          .map(normalizeUpload)
          .filter((item): item is SpendingUpload => item != null)
      : [],
    ...(typeof row.updatedAt === 'string' && row.updatedAt
      ? { updatedAt: row.updatedAt }
      : {}),
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

export function descriptionMatchesRule(description: string, match: string) {
  const needle = match.trim().toLowerCase()
  if (!needle) return false
  return description.toLowerCase().includes(needle)
}

export function matchingSpendingRule(
  description: string,
  rules: SpendingRule[],
) {
  const hits = rules.filter((rule) =>
    descriptionMatchesRule(description, rule.match),
  )
  if (hits.length === 0) return null
  return [...hits].sort(
    (left, right) => right.match.trim().length - left.match.trim().length,
  )[0]
}

export function applySpendingRules(
  transactions: SpendingTxn[],
  rules: SpendingRule[],
): SpendingTxn[] {
  return transactions.map((txn) => {
    const rule = matchingSpendingRule(txn.description, rules)
    let next = txn
    if (!txn.customName) {
      const merchant = rule
        ? toSentenceCase(rule.merchant)
        : cleanMerchantName(txn.description) || toSentenceCase(txn.merchant)
      if (merchant !== next.merchant) next = { ...next, merchant }
    }
    if (!txn.customCategory && rule?.categoryId && rule.categoryId !== next.categoryId) {
      next = { ...next, categoryId: rule.categoryId }
    }
    return next
  })
}

/** Pick one spending document. Unioning lists revives deleted statements. */
export function mergeSpending(
  remote: SpendingState,
  local: SpendingState,
): SpendingState {
  const remoteAt = stamp(remote.updatedAt)
  const localAt = stamp(local.updatedAt)
  if (localAt !== remoteAt) return localAt > remoteAt ? local : remote
  return local
}

export function touchSpending(state: SpendingState): SpendingState {
  return { ...state, updatedAt: new Date().toISOString() }
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

export type SpendingUploadBatch = {
  name: string
  transactions: NewSpendingTxn[]
}

export function transactionsForUpload(
  transactions: SpendingTxn[],
  upload: SpendingUpload,
  uploads: SpendingUpload[],
) {
  const othersWithName = uploads.some(
    (item) => item.id !== upload.id && item.name === upload.name,
  )
  return transactions.filter((txn) => {
    if (txn.uploadId) return txn.uploadId === upload.id
    return !othersWithName && txn.sourceFile === upload.name
  })
}

export function removeSpendingUpload(
  current: SpendingState,
  uploadId: string,
): SpendingState {
  const uploads = current.uploads ?? []
  const upload = uploads.find((item) => item.id === uploadId)
  if (!upload) return current
  const removeIds = new Set(
    transactionsForUpload(current.transactions, upload, uploads).map(
      (txn) => txn.id,
    ),
  )
  return {
    ...current,
    uploads: uploads.filter((item) => item.id !== uploadId),
    transactions: current.transactions.filter((txn) => !removeIds.has(txn.id)),
  }
}

export function importSpendingTxns(
  current: SpendingState,
  batches: SpendingUploadBatch[],
) {
  const now = new Date().toISOString()
  const added: SpendingTxn[] = []
  const uploads: SpendingUpload[] = [...(current.uploads ?? [])]

  for (const batch of batches) {
    const name = batch.name.trim()
    if (!name) continue
    const uploadId = crypto.randomUUID()
    uploads.push({ id: uploadId, name, uploadedAt: now })
    for (const item of batch.transactions) {
      added.push({
        ...item,
        sourceFile: name,
        uploadId,
        id: crypto.randomUUID(),
        updatedAt: now,
      })
    }
  }

  return {
    state: {
      ...current,
      transactions: applySpendingRules(
        [...current.transactions, ...added],
        current.rules,
      ),
      uploads,
    },
    added: added.length,
  }
}
