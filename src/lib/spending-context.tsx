import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '@/lib/auth-context'
import {
  applySpendingRules,
  importSpendingTxns,
  loadSpending,
  removeSpendingUpload,
  saveSpending,
  toSentenceCase,
  touchSpending,
  type SpendingCategory,
  type SpendingRule,
  type SpendingState,
  type SpendingTxn,
  type SpendingUpload,
  type SpendingUploadBatch,
} from '@/lib/spending'
import { supabase } from '@/lib/supabase'
import {
  initialSync,
  markCloudReady,
  rememberSpending,
  resetSync,
  schedulePush,
  startPeriodicSync,
  suppressNextPush,
} from '@/lib/user-app-state-v2'

export const ADD_TRANSACTION_EVENT = 'mybudget:add-transaction'

let addTransactionRequested = false

export function requestAddTransaction() {
  addTransactionRequested = true
  window.dispatchEvent(new Event(ADD_TRANSACTION_EVENT))
}

export function takeAddTransactionRequest() {
  const requested = addTransactionRequested
  addTransactionRequested = false
  return requested
}

type SpendingContextValue = {
  transactions: SpendingTxn[]
  rules: SpendingRule[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  importTransactions: (batches: SpendingUploadBatch[]) => {
    added: number
  }
  addTransaction: (input: {
    date: string
    description: string
    merchant: string
    accountId: string
    amount: number
    categoryId?: string
    affirmLoanId?: string
    note?: string
  }) => string
  updateTransaction: (
    id: string,
    patch: Partial<Omit<SpendingTxn, 'id'>>,
  ) => void
  removeTransaction: (id: string) => void
  removeUpload: (id: string) => void
  addCategory: (name: string, expenseIds?: string[]) => string | null
  replaceCategories: (categories: SpendingCategory[]) => void
  addRule: (input: {
    match: string
    merchant: string
    categoryId?: string
  }) => void
  updateRule: (
    id: string,
    patch: Partial<Pick<SpendingRule, 'match' | 'merchant' | 'categoryId'>>,
  ) => void
  removeRule: (id: string) => void
}

const SpendingContext = createContext<SpendingContextValue | null>(null)

function nowIso() {
  return new Date().toISOString()
}

export function SpendingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const firstPersist = useRef(true)
  const applyingCloud = useRef(false)
  const [state, setState] = useState<SpendingState>(() => {
    const loaded = loadSpending()
    return {
      ...loaded,
      transactions: applySpendingRules(loaded.transactions, loaded.rules),
    }
  })

  useEffect(() => {
    const fromCloudApply = applyingCloud.current
    const skipStamp = firstPersist.current || fromCloudApply
    firstPersist.current = false
    applyingCloud.current = false
    const next = skipStamp ? state : touchSpending(state)
    const stored = saveSpending(next)
    rememberSpending(stored)
    schedulePush()
    if (
      stored.transactions.length !== state.transactions.length ||
      stored.categories.length !== state.categories.length ||
      stored.rules.length !== state.rules.length ||
      (stored.uploads?.length ?? 0) !== (state.uploads?.length ?? 0)
    ) {
      if (fromCloudApply) suppressNextPush()
      setState(stored)
    }
  }, [state])

  useEffect(() => {
    if (loading) return
    if (!supabase || !user) {
      if (!supabase) markCloudReady()
      else resetSync()
      return
    }
    let cancelled = false
    void (async () => {
      const cloudState = await initialSync()
      if (cancelled) return
      markCloudReady()
      startPeriodicSync()
      
      if (cloudState) {
        applyingCloud.current = true
        const spending = cloudState.spending
        setState({
          ...spending,
          transactions: applySpendingRules(spending.transactions, spending.rules),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user])

  // Listen for storage events to pick up merged remote changes
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'mybudget.spending.v1' && event.newValue) {
        try {
          const spending = JSON.parse(event.newValue) as SpendingState
          applyingCloud.current = true
          setState({
            ...spending,
            transactions: applySpendingRules(spending.transactions, spending.rules),
          })
        } catch {
          // Invalid JSON, ignore
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  const value = useMemo<SpendingContextValue>(
    () => ({
      transactions: state.transactions,
      rules: state.rules,
      categories: state.categories,
      uploads: state.uploads ?? [],
      importTransactions(batches) {
        const next = importSpendingTxns(state, batches)
        setState(next.state)
        return { added: next.added }
      },
      addTransaction(input) {
        const id = crypto.randomUUID()
        const merchant = toSentenceCase(input.merchant)
        const description = input.description.trim() || merchant
        const categoryId = input.categoryId?.trim()
        const note = input.note?.trim()
        const txn: SpendingTxn = {
          id,
          date: input.date,
          description,
          merchant,
          accountId: input.accountId,
          amount: input.amount,
          ...(categoryId ? { categoryId } : {}),
          customName: true,
          customCategory: true,
          ...(input.affirmLoanId ? { affirmLoanId: input.affirmLoanId } : {}),
          ...(note ? { note } : {}),
          updatedAt: nowIso(),
        }
        setState((current) => ({
          ...current,
          transactions: applySpendingRules(
            [...current.transactions, txn],
            current.rules,
          ),
        }))
        return id
      },
      updateTransaction(id, patch) {
        setState((current) => ({
          ...current,
          transactions: current.transactions.map((txn) => {
            if (txn.id !== id) return txn
            const next = { ...txn, ...patch, updatedAt: nowIso() }
            if ('note' in patch) {
              const note = next.note?.trim()
              if (note) next.note = note
              else delete next.note
            }
            return next
          }),
        }))
      },
      removeTransaction(id) {
        setState((current) => ({
          ...current,
          transactions: current.transactions.filter((txn) => txn.id !== id),
          removedTransactionIds: [...new Set([...(current.removedTransactionIds ?? []), id])],
        }))
      },
      removeUpload(id) {
        setState((current) => removeSpendingUpload(current, id))
      },
      addCategory(name, expenseIds) {
        const trimmed = toSentenceCase(name)
        if (!trimmed) return null
        const id = crypto.randomUUID()
        const linked = (expenseIds ?? []).map((item) => item.trim()).filter(Boolean)
        setState((current) => ({
          ...current,
          categories: [
            ...current.categories,
            {
              id,
              name: trimmed,
              ...(linked.length > 0 ? { expenseIds: linked } : {}),
              grouped: true,
              updatedAt: nowIso(),
            },
          ],
        }))
        return id
      },
      replaceCategories(categories) {
        const next: SpendingCategory[] = []
        for (const item of categories) {
          const name = toSentenceCase(item.name)
          if (!name) continue
          const expenseIds = [
            ...new Set(
              (item.expenseIds ?? [])
                .concat(item.expenseId ? [item.expenseId] : [])
                .map((id) => id.trim())
                .filter(Boolean),
            ),
          ]
          next.push({
            id: item.id,
            name,
            ...(expenseIds.length > 0 ? { expenseIds } : {}),
            ...(item.parentId ? { parentId: item.parentId } : {}),
            ...(item.budget != null ? { budget: item.budget } : {}),
            ...(item.grouped ? { grouped: true } : {}),
            ...(item.enabled === false ? { enabled: false } : {}),
            updatedAt: nowIso(),
          })
        }
        const ids = new Set(next.map((item) => item.id))
        const expenseToCategory = new Map<string, string>()
        for (const item of next) {
          for (const expenseId of item.expenseIds ?? []) {
            expenseToCategory.set(expenseId, item.id)
          }
        }
        setState((current) => ({
          ...current,
          categories: next,
          removedCategoryIds: [
            ...new Set([
              ...(current.removedCategoryIds ?? []),
              ...current.categories
                .filter((item) => !ids.has(item.id))
                .map((item) => item.id),
            ]),
          ],
          transactions: current.transactions.map((txn) => {
            if (!txn.categoryId || ids.has(txn.categoryId)) return txn
            const old = current.categories.find((item) => item.id === txn.categoryId)
            const parentId =
              old?.parentId && ids.has(old.parentId) ? old.parentId : undefined
            const moved =
              parentId ??
              (old?.expenseIds ?? [])
                .concat(old?.expenseId ? [old.expenseId] : [])
                .map((id) => expenseToCategory.get(id))
                .find((id) => id != null)
            return {
              ...txn,
              categoryId: moved,
              customCategory: true,
              updatedAt: nowIso(),
            }
          }),
        }))
      },
      addRule(input) {
        const match = input.match.trim()
        const merchant = toSentenceCase(input.merchant)
        const categoryId = input.categoryId?.trim()
        if (!match || !merchant) return
        setState((current) => {
          const rules: SpendingRule[] = [
            ...current.rules,
            {
              id: crypto.randomUUID(),
              match,
              merchant,
              ...(categoryId ? { categoryId } : {}),
              updatedAt: nowIso(),
            },
          ]
          return {
            ...current,
            rules,
            transactions: applySpendingRules(current.transactions, rules),
          }
        })
      },
      updateRule(id, patch) {
        setState((current) => {
          const rules = current.rules.map((rule) =>
            rule.id === id
              ? {
                  ...rule,
                  ...patch,
                  match: patch.match?.trim() ?? rule.match,
                  merchant: patch.merchant
                    ? toSentenceCase(patch.merchant)
                    : rule.merchant,
                  updatedAt: nowIso(),
                }
              : rule,
          )
          return {
            ...current,
            rules,
            transactions: applySpendingRules(current.transactions, rules),
          }
        })
      },
      removeRule(id) {
        setState((current) => {
          const rules = current.rules.filter((rule) => rule.id !== id)
          return {
            ...current,
            rules,
            removedRuleIds: [...new Set([...(current.removedRuleIds ?? []), id])],
            transactions: applySpendingRules(current.transactions, rules),
          }
        })
      },
    }),
    [state],
  )

  return (
    <SpendingContext.Provider value={value}>{children}</SpendingContext.Provider>
  )
}

export function useSpending() {
  const context = useContext(SpendingContext)
  if (!context) {
    throw new Error('useSpending must be used within SpendingProvider')
  }
  return context
}

