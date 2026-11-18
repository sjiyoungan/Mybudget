import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  applyDebtsToExpenses,
  applyExpensesToDebts,
  endExpenseFromNow,
  isEndedExpense,
  isLiveExpense,
  loadBudget,
  saveBudget,
  withBudgetEdit,
  type AccountKind,
  type AccountRole,
  type BankAccount,
  type BudgetState,
  type Debt,
  type ExpenseCategoryGroup,
  type RecurringExpense,
} from '@/lib/budget'
import { AFFIRM_DEBT_ID, debtsWithAffirmPlan, loadDebtPlan } from '@/lib/debt-plan'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import {
  initialSync,
  markCloudReady,
  rememberBudget,
  resetSync,
  schedulePush,
  startPeriodicSync,
} from '@/lib/user-app-state-v2'

function withLinkedExpenses(current: BudgetState, expenses: RecurringExpense[]) {
  return withBudgetEdit({
    ...current,
    expenses,
    debts: applyExpensesToDebts(expenses, current.debts),
  })
}

function withLinkedDebts(current: BudgetState, debts: Debt[]) {
  return withBudgetEdit({
    ...current,
    debts,
    expenses: applyDebtsToExpenses(current.expenses, debts),
  })
}

type BudgetContextValue = {
  accounts: BankAccount[]
  categories: ExpenseCategoryGroup[]
  expenses: RecurringExpense[]
  debts: Debt[]
  addAccount: (input: {
    name: string
    kind: AccountKind
    role: AccountRole
  }) => string
  updateAccountBalance: (id: string, balance: number) => void
  setAccountRole: (id: string, role: AccountRole) => void
  removeAccount: (id: string) => void
  addExpense: (input: Omit<RecurringExpense, 'id'>) => void
  updateExpense: (
    id: string,
    patch: Partial<Omit<RecurringExpense, 'id'>>,
  ) => void
  removeExpense: (id: string) => void
  replaceExpenses: (expenses: RecurringExpense[]) => void
  replaceCategories: (categories: ExpenseCategoryGroup[]) => void
  replaceAccounts: (accounts: BankAccount[]) => void
  addDebt: (input: Omit<Debt, 'id'>) => void
  removeDebt: (id: string) => void
  replaceDebts: (debts: Debt[]) => void
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

function withExclusiveRole(
  accounts: BankAccount[],
  id: string,
  role: AccountRole,
) {
  return accounts.map((account) => {
    if (account.id === id) return { ...account, role }
    if (
      (role === 'bills' || role === 'overflow') &&
      account.role === role
    ) {
      return { ...account, role: 'other' as const }
    }
    return account
  })
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [state, setState] = useState<BudgetState | null>(null)

  useEffect(() => {
    if (state) {
      saveBudget(state)
      rememberBudget(state)
      schedulePush()
    }
  }, [state])

  useEffect(() => {
    if (loading) return
    if (!supabase || !user) {
      setState(loadBudget())
      if (!supabase) markCloudReady()
      else resetSync()
      return
    }
    let cancelled = false
    void (async () => {
      const cloudState = await initialSync()
      if (cancelled) return
      
      if (cloudState) {
        setState(cloudState.budget)
      } else {
        setState(loadBudget())
      }
      
      markCloudReady()
      startPeriodicSync()
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user])

  const currentState = state || loadBudget()
  
  const value = useMemo<BudgetContextValue>(
    () => ({
      accounts: currentState.accounts,
      categories: currentState.categories,
      expenses: currentState.expenses,
      debts: debtsWithAffirmPlan(currentState.debts, loadDebtPlan().affirmLoans),
      addAccount({ name, kind, role }) {
        const id = crypto.randomUUID()
        setState((current) => {
          const next: BankAccount = {
            id,
            name,
            kind,
            lastFour: '',
            role: 'other',
            purpose: '',
            balance: 0,
          }
          return withBudgetEdit({
            ...current,
            accounts: withExclusiveRole(
              [...current.accounts, next],
              next.id,
              role,
            ),
          })
        })
        return id
      },
      updateAccountBalance(id, balance) {
        setState((current) =>
          withBudgetEdit({
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === id ? { ...account, balance } : account,
            ),
          }),
        )
      },
      setAccountRole(id, role) {
        setState((current) =>
          withBudgetEdit({
            ...current,
            accounts: withExclusiveRole(current.accounts, id, role),
          }),
        )
      },
      removeAccount(id) {
        setState((current) =>
          withBudgetEdit({
            ...current,
            accounts: current.accounts.filter((account) => account.id !== id),
          }),
        )
      },
      addExpense(input) {
        setState((current) =>
          withLinkedExpenses(current, [
            ...current.expenses,
            { ...input, id: crypto.randomUUID() },
          ]),
        )
      },
      updateExpense(id, patch) {
        setState((current) =>
          withLinkedExpenses(
            current,
            current.expenses.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          ),
        )
      },
      removeExpense(id) {
        setState((current) =>
          withLinkedExpenses(
            current,
            current.expenses.map((item) =>
              item.id === id ? endExpenseFromNow(item) : item,
            ),
          ),
        )
      },
      replaceExpenses(expenses) {
        setState((current) => {
          const incomingIds = new Set(expenses.map((item) => item.id))
          const keptEnded = current.expenses.filter(
            (item) => isEndedExpense(item) && !incomingIds.has(item.id),
          )
          const newlyEnded = current.expenses
            .filter(
              (item) =>
                isLiveExpense(item) &&
                !incomingIds.has(item.id) &&
                !isEndedExpense(item),
            )
            .map((item) => endExpenseFromNow(item))
          return withLinkedExpenses(current, [
            ...keptEnded,
            ...newlyEnded,
            ...expenses.filter((item) => !isEndedExpense(item)),
          ])
        })
      },
      replaceCategories(categories) {
        setState((current) => withBudgetEdit({ ...current, categories }))
      },
      replaceAccounts(accounts) {
        setState((current) => withBudgetEdit({ ...current, accounts }))
      },
      addDebt(input) {
        setState((current) =>
          withLinkedDebts(current, [
            ...current.debts,
            { ...input, id: crypto.randomUUID() },
          ]),
        )
      },
      removeDebt(id) {
        if (id === AFFIRM_DEBT_ID) return
        setState((current) =>
          withLinkedDebts(
            current,
            current.debts.filter((item) => item.id !== id),
          ),
        )
      },
      replaceDebts(debts) {
        setState((current) => {
          const storedAffirm = current.debts.find(
            (item) => item.id === AFFIRM_DEBT_ID,
          )
          const next = debts.filter((item) => item.id !== AFFIRM_DEBT_ID)
          return withLinkedDebts(
            current,
            storedAffirm ? [...next, storedAffirm] : next,
          )
        })
      },
    }),
    [state],
  )

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  )
}

export function useBudget() {
  const value = useContext(BudgetContext)
  if (!value) {
    throw new Error('useBudget must be used within BudgetProvider')
  }
  return value
}
