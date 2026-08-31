import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  compareExpensesByDueDay,
  loadBudget,
  saveBudget,
  type AccountKind,
  type AccountRole,
  type BankAccount,
  type BudgetState,
  type Debt,
  type ExpenseCategoryGroup,
  type RecurringExpense,
} from '@/lib/budget'

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
  const [state, setState] = useState<BudgetState>(() => loadBudget())

  useEffect(() => {
    saveBudget(state)
  }, [state])

  const value = useMemo<BudgetContextValue>(
    () => ({
      accounts: state.accounts,
      categories: state.categories,
      expenses: state.expenses,
      debts: state.debts,
      addAccount({ name, kind, role }) {
        const id = crypto.randomUUID()
        setState((current) => {
          const next: BankAccount = {
            id,
            name,
            kind,
            lastFour: '',
            role: 'other',
            balance: 0,
          }
          return {
            ...current,
            accounts: withExclusiveRole(
              [...current.accounts, next],
              next.id,
              role,
            ),
          }
        })
        return id
      },
      updateAccountBalance(id, balance) {
        setState((current) => ({
          ...current,
          accounts: current.accounts.map((account) =>
            account.id === id ? { ...account, balance } : account,
          ),
        }))
      },
      setAccountRole(id, role) {
        setState((current) => ({
          ...current,
          accounts: withExclusiveRole(current.accounts, id, role),
        }))
      },
      removeAccount(id) {
        setState((current) => ({
          ...current,
          accounts: current.accounts.filter((account) => account.id !== id),
        }))
      },
      addExpense(input) {
        setState((current) => ({
          ...current,
          expenses: [
            ...current.expenses,
            { ...input, id: crypto.randomUUID() },
          ].sort(compareExpensesByDueDay),
        }))
      },
      updateExpense(id, patch) {
        setState((current) => ({
          ...current,
          expenses: current.expenses
            .map((item) => (item.id === id ? { ...item, ...patch } : item))
            .sort(compareExpensesByDueDay),
        }))
      },
      removeExpense(id) {
        setState((current) => ({
          ...current,
          expenses: current.expenses.filter((item) => item.id !== id),
        }))
      },
      replaceExpenses(expenses) {
        setState((current) => ({
          ...current,
          expenses: [...expenses].sort(compareExpensesByDueDay),
        }))
      },
      replaceCategories(categories) {
        setState((current) => ({
          ...current,
          categories,
        }))
      },
      replaceAccounts(accounts) {
        setState((current) => ({
          ...current,
          accounts,
        }))
      },
      addDebt(input) {
        setState((current) => ({
          ...current,
          debts: [...current.debts, { ...input, id: crypto.randomUUID() }],
        }))
      },
      removeDebt(id) {
        setState((current) => ({
          ...current,
          debts: current.debts.filter((item) => item.id !== id),
        }))
      },
      replaceDebts(debts) {
        setState((current) => ({
          ...current,
          debts,
        }))
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
