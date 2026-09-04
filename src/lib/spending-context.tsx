import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '@/lib/auth-context'
import {
  applySpendingRules,
  emptySpending,
  importSpendingTxns,
  loadSpending,
  mergeSpending,
  removeSpendingUpload,
  saveSpending,
  toSentenceCase,
  type SpendingCategory,
  type SpendingRule,
  type SpendingState,
  type SpendingTxn,
  type SpendingUpload,
  type SpendingUploadBatch,
} from '@/lib/spending'
import { supabase } from '@/lib/supabase'
import {
  markCloudReady,
  pushUserAppStateNow,
  rememberSpending,
  resetUserAppStateSync,
  scheduleUserAppStatePush,
  syncUserAppStateFromCloud,
} from '@/lib/user-app-state'

const SPENDING_WIPE_KEY = 'mybudget.spending.wiped'
const SPENDING_WIPE_TOKEN = '2026-09-04-all'

function spendingNeedsWipe() {
  try {
    return localStorage.getItem(SPENDING_WIPE_KEY) !== SPENDING_WIPE_TOKEN
  } catch {
    return false
  }
}

function markSpendingWiped() {
  try {
    localStorage.setItem(SPENDING_WIPE_KEY, SPENDING_WIPE_TOKEN)
  } catch {
    // ignore
  }
}

type SpendingContextValue = {
  transactions: SpendingTxn[]
  rules: SpendingRule[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  importTransactions: (batches: SpendingUploadBatch[]) => {
    added: number
  }
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
  const [state, setState] = useState<SpendingState>(() => {
    const loaded = loadSpending()
    return {
      ...loaded,
      transactions: applySpendingRules(loaded.transactions, loaded.rules),
    }
  })

  useEffect(() => {
    saveSpending(state)
    rememberSpending(state)
    scheduleUserAppStatePush()
  }, [state])

  useEffect(() => {
    if (loading) return
    if (!supabase || !user) {
      if (spendingNeedsWipe()) {
        markSpendingWiped()
        const empty = emptySpending()
        saveSpending(empty)
        rememberSpending(empty)
        setState(empty)
      }
      if (!supabase) markCloudReady()
      else resetUserAppStateSync()
      return
    }
    let cancelled = false
    void (async () => {
      const synced = await syncUserAppStateFromCloud()
      if (cancelled) return
      if (spendingNeedsWipe()) {
        const empty = emptySpending()
        saveSpending(empty)
        rememberSpending(empty)
        setState(empty)
        await pushUserAppStateNow()
        markSpendingWiped()
        markCloudReady()
        return
      }
      setState((current) => {
        const merged = mergeSpending(synced.spending, current)
        return {
          ...merged,
          transactions: applySpendingRules(merged.transactions, merged.rules),
        }
      })
      markCloudReady()
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user])

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
      updateTransaction(id, patch) {
        setState((current) => ({
          ...current,
          transactions: current.transactions.map((txn) =>
            txn.id === id ? { ...txn, ...patch, updatedAt: nowIso() } : txn,
          ),
        }))
      },
      removeTransaction(id) {
        setState((current) => ({
          ...current,
          transactions: current.transactions.filter((txn) => txn.id !== id),
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
          transactions: current.transactions.map((txn) => {
            if (!txn.categoryId || ids.has(txn.categoryId)) return txn
            const old = current.categories.find((item) => item.id === txn.categoryId)
            const moved = (old?.expenseIds ?? [])
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

