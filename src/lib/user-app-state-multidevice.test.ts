/**
 * Multi-device sync tests simulating 3 devices with stale localStorage.
 * 
 * Scenarios:
 * 1. Device A adds item, Device B with stale cache pulls, should see new item
 * 2. Device A deletes item, Device B with old cache has deleted item, should stay deleted (tombstone)
 * 3. Device A edits item with newer timestamp, Device B has old edit, A's edit should win
 * 4. Device B has ancient localStorage with resurrected items, should NOT resurrect to cloud
 */

import { describe, it, expect } from 'vitest'
import { mergeDebtPlanStates } from './debt-plan-merge'
import { mergeSpendingStates } from './spending-merge'
import type { DebtPlanState } from './debt-plan'
import type { SpendingState } from './spending'

describe('Multi-device sync scenarios', () => {
  describe('Debt plan sync', () => {
    it('Device A adds loan, Device B pulls stale cache → should see new loan', () => {
      // Device A: current cloud state with new loan
      const cloudState: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan1',
            name: 'Old Loan',
            loanId: 'OLD-123',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500,
            updatedAt: '2026-11-01T10:00:00Z',
          },
          {
            id: 'loan2',
            name: 'New Loan',
            loanId: 'NEW-456',
            startMonth: '2026-11',
            lastPayment: '2027-10',
            startingBalance: 2000,
            monthly: 200,
            remaining: 2000,
            updatedAt: '2026-11-18T03:00:00Z', // Just added
          },
        ],
        removedLoanIds: [],
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Device B: stale localStorage with only old loan
      const staleLocal: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan1',
            name: 'Old Loan',
            loanId: 'OLD-123',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500,
          },
        ],
        removedLoanIds: [],
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Merge: cloud state should win (has new loan)
      const merged = mergeDebtPlanStates(
        staleLocal as DebtPlanState,
        cloudState as DebtPlanState,
      )

      expect(merged.affirmLoans).toHaveLength(2)
      expect(merged.affirmLoans.find((l) => l.id === 'loan2')).toBeDefined()
      expect(merged.affirmLoans.find((l) => l.id === 'loan2')?.name).toBe('New Loan')
    })

    it('Device A deletes loan, Device B has deleted loan in stale cache → should stay deleted', () => {
      // Device A: cloud state with tombstone
      const cloudState: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan1',
            name: 'Active Loan',
            loanId: 'ACTIVE-123',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500,
            updatedAt: '2026-11-01T10:00:00Z',
          },
        ],
        removedLoanIds: ['loan-deleted'], // Deleted
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Device B: stale cache still has deleted loan
      const staleLocal: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan1',
            name: 'Active Loan',
            loanId: 'ACTIVE-123',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500,
          },
          {
            id: 'loan-deleted',
            name: 'Deleted Loan',
            loanId: 'OLD-999',
            startMonth: '2025-01',
            lastPayment: '2026-01',
            startingBalance: 500,
            monthly: 50,
            remaining: 0,
          },
        ],
        removedLoanIds: [],
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Merge: deleted loan should NOT resurrect
      const merged = mergeDebtPlanStates(
        staleLocal as DebtPlanState,
        cloudState as DebtPlanState,
      )

      expect(merged.affirmLoans).toHaveLength(1)
      expect(merged.affirmLoans.find((l) => l.id === 'loan-deleted')).toBeUndefined()
      expect(merged.removedLoanIds).toContain('loan-deleted')
    })

    it('Device A edits loan (newer timestamp), Device B has old edit → A wins', () => {
      // Device A: cloud with recent edit
      const cloudState: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan1',
            name: 'Loan',
            loanId: 'LOAN-123',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 400, // Updated to 400
            updatedAt: '2026-11-18T03:00:00Z', // Recent
          },
        ],
        removedLoanIds: [],
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Device B: stale edit
      const staleLocal: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan1',
            name: 'Loan',
            loanId: 'LOAN-123',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500, // Old value
            updatedAt: '2026-11-01T10:00:00Z', // Older
          },
        ],
        removedLoanIds: [],
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Merge: cloud (newer) should win
      const merged = mergeDebtPlanStates(
        staleLocal as DebtPlanState,
        cloudState as DebtPlanState,
      )

      expect(merged.affirmLoans).toHaveLength(1)
      expect(merged.affirmLoans[0].remaining).toBe(400) // Cloud value wins
      expect(merged.affirmLoans[0].updatedAt).toBe('2026-11-18T03:00:00Z')
    })

    it('Device B has ancient localStorage with 3 extra loans → should NOT resurrect', () => {
      // Device A: current cloud (correct state)
      const cloudState: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan-current-1',
            name: 'Current Loan 1',
            loanId: 'CUR-001',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500,
            updatedAt: '2026-11-18T03:00:00Z',
          },
        ],
        removedLoanIds: ['loan-old-1', 'loan-old-2', 'loan-old-3'], // Known deleted
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Device B: ancient localStorage with old deleted loans (no timestamps)
      const ancientLocal: Partial<DebtPlanState> = {
        affirmLoans: [
          {
            id: 'loan-current-1',
            name: 'Current Loan 1',
            loanId: 'CUR-001',
            startMonth: '2026-01',
            lastPayment: '2026-12',
            startingBalance: 1000,
            monthly: 100,
            remaining: 500,
            // No updatedAt (ancient)
          },
          {
            id: 'loan-old-1',
            name: 'Old Loan 1',
            loanId: 'OLD-001',
            startMonth: '2025-01',
            lastPayment: '2025-12',
            startingBalance: 500,
            monthly: 50,
            remaining: 0,
            // No updatedAt
          },
          {
            id: 'loan-old-2',
            name: 'Old Loan 2',
            loanId: 'OLD-002',
            startMonth: '2025-01',
            lastPayment: '2025-12',
            startingBalance: 300,
            monthly: 30,
            remaining: 0,
          },
          {
            id: 'loan-old-3',
            name: 'Old Loan 3',
            loanId: 'OLD-003',
            startMonth: '2025-01',
            lastPayment: '2025-12',
            startingBalance: 200,
            monthly: 20,
            remaining: 0,
          },
        ],
        removedLoanIds: [], // No tombstones in old localStorage
        closedDebts: [],
        loggedMonths: [],
        loggedHistory: {},
        monthlyBudget: 5000,
        strategy: 'avalanche',
        chargesByMonth: {},
        interestByMonth: {},
        adjustmentsByMonth: {},
        paymentsByMonth: {},
        extraByMonth: {},
        recurringCharges: {},
      }

      // Merge: old loans should NOT resurrect
      const merged = mergeDebtPlanStates(
        ancientLocal as DebtPlanState,
        cloudState as DebtPlanState,
      )

      // Should only have 1 current loan
      expect(merged.affirmLoans).toHaveLength(1)
      expect(merged.affirmLoans[0].id).toBe('loan-current-1')
      
      // Old loans should be excluded by tombstones
      expect(merged.affirmLoans.find((l) => l.id === 'loan-old-1')).toBeUndefined()
      expect(merged.affirmLoans.find((l) => l.id === 'loan-old-2')).toBeUndefined()
      expect(merged.affirmLoans.find((l) => l.id === 'loan-old-3')).toBeUndefined()
      
      // Tombstones preserved
      expect(merged.removedLoanIds).toContain('loan-old-1')
      expect(merged.removedLoanIds).toContain('loan-old-2')
      expect(merged.removedLoanIds).toContain('loan-old-3')
    })
  })

  describe('Spending sync', () => {
    it('Device A adds transaction, Device B pulls stale cache → should see new transaction', () => {
      const cloudState: Partial<SpendingState> = {
        transactions: [
          {
            id: 'tx1',
            date: '2026-11-01',
            merchant: 'Store A',
            amount: 50,
            description: 'Old Transaction',
            categoryId: 'groceries',
            accountId: 'acct1',
            updatedAt: '2026-11-01T10:00:00Z',
          },
          {
            id: 'tx2',
            date: '2026-11-18',
            merchant: 'Store B',
            amount: 100,
            description: 'New Transaction',
            categoryId: 'gas',
            accountId: 'acct1',
            updatedAt: '2026-11-18T03:00:00Z',
          },
        ],
        removedTransactionIds: [],
        categories: [],
        removedCategoryIds: [],
        rules: [],
        removedRuleIds: [],
        uploads: [],
        removedUploadIds: [],
      }

      const staleLocal: Partial<SpendingState> = {
        transactions: [
          {
            id: 'tx1',
            date: '2026-11-01',
            merchant: 'Store A',
            amount: 50,
            description: 'Old Transaction',
            categoryId: 'groceries',
            accountId: 'acct1',
          },
        ],
        removedTransactionIds: [],
        categories: [],
        removedCategoryIds: [],
        rules: [],
        removedRuleIds: [],
        uploads: [],
        removedUploadIds: [],
      }

      const merged = mergeSpendingStates(
        staleLocal as SpendingState,
        cloudState as SpendingState,
      )

      expect(merged.transactions).toHaveLength(2)
      expect(merged.transactions.find((t) => t.id === 'tx2')).toBeDefined()
    })

    it('Device A deletes transaction, Device B has deleted transaction → should stay deleted', () => {
      const cloudState: Partial<SpendingState> = {
        transactions: [
          {
            id: 'tx1',
            date: '2026-11-01',
            merchant: 'Store A',
            amount: 50,
            description: 'Active Transaction',
            categoryId: 'groceries',
            accountId: 'acct1',
            updatedAt: '2026-11-01T10:00:00Z',
          },
        ],
        removedTransactionIds: ['tx-deleted'],
        categories: [],
        removedCategoryIds: [],
        rules: [],
        removedRuleIds: [],
        uploads: [],
        removedUploadIds: [],
      }

      const staleLocal: Partial<SpendingState> = {
        transactions: [
          {
            id: 'tx1',
            date: '2026-11-01',
            merchant: 'Store A',
            amount: 50,
            description: 'Active Transaction',
            categoryId: 'groceries',
            accountId: 'acct1',
          },
          {
            id: 'tx-deleted',
            date: '2026-10-01',
            merchant: 'Store B',
            amount: 25,
            description: 'Deleted Transaction',
            categoryId: 'other',
            accountId: 'acct1',
          },
        ],
        removedTransactionIds: [],
        categories: [],
        removedCategoryIds: [],
        rules: [],
        removedRuleIds: [],
        uploads: [],
        removedUploadIds: [],
      }

      const merged = mergeSpendingStates(
        staleLocal as SpendingState,
        cloudState as SpendingState,
      )

      expect(merged.transactions).toHaveLength(1)
      expect(merged.transactions.find((t) => t.id === 'tx-deleted')).toBeUndefined()
      expect(merged.removedTransactionIds).toContain('tx-deleted')
    })
  })
})
