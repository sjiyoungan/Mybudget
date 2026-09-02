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
  importSpendingTxns,
  loadSpending,
  mergeSpending,
  saveSpending,
  type NewSpendingTxn,
  type SpendingRule,
  type SpendingState,
  type SpendingTxn,
} from '@/lib/spending'
import { supabase } from '@/lib/supabase'
import {
  markCloudReady,
  rememberSpending,
  resetUserAppStateSync,
  scheduleUserAppStatePush,
  syncUserAppStateFromCloud,
} from '@/lib/user-app-state'

type SpendingContextValue = {
  transactions: SpendingTxn[]
  rules: SpendingRule[]
  importTransactions: (incoming: NewSpendingTxn[]) => {
    added: number
    skipped: number
  }
  updateTransaction: (
    id: string,
    patch: Partial<Omit<SpendingTxn, 'id'>>,
  ) => void
  removeTransaction: (id: string) => void
  addRule: (input: { match: string; merchant: string }) => void
  updateRule: (
    id: string,
    patch: Partial<Pick<SpendingRule, 'match' | 'merchant'>>,
  ) => void
  removeRule: (id: string) => void
}

const SpendingContext = createContext<SpendingContextValue | null>(null)

function nowIso() {
  return new Date().toISOString()
}

export function SpendingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [state, setState] = useState<SpendingState>(() => loadSpending())

  useEffect(() => {
    saveSpending(state)
    rememberSpending(state)
    scheduleUserAppStatePush()
  }, [state])

  useEffect(() => {
    if (loading) return
    if (!supabase || !user) {
      if (!supabase) markCloudReady()
      else resetUserAppStateSync()
      return
    }
    let cancelled = false
    void (async () => {
      const synced = await syncUserAppStateFromCloud()
      if (cancelled) return
      setState((current) => mergeSpending(synced.spending, current))
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
      importTransactions(incoming) {
        const next = importSpendingTxns(state, incoming)
        setState(next.state)
        return { added: next.added, skipped: next.skipped }
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
      addRule(input) {
        const match = input.match.trim()
        const merchant = input.merchant.trim()
        if (!match || !merchant) return
        setState((current) => {
          const rules: SpendingRule[] = [
            ...current.rules,
            {
              id: crypto.randomUUID(),
              match,
              merchant,
              updatedAt: nowIso(),
            },
          ]
          return {
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
                  merchant: patch.merchant?.trim() ?? rule.merchant,
                  updatedAt: nowIso(),
                }
              : rule,
          )
          return {
            rules,
            transactions: applySpendingRules(current.transactions, rules),
          }
        })
      },
      removeRule(id) {
        setState((current) => {
          const rules = current.rules.filter((rule) => rule.id !== id)
          return {
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

