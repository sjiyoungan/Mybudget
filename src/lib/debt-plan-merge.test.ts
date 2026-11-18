import { describe, expect, it } from 'vitest'
import type { Debt } from './budget'
import { mergeDebtPlanStates } from './debt-plan-merge'
import type { AffirmLoan, DebtPlanState } from './debt-plan'

const baseDebtPlan: DebtPlanState = {
  monthlyBudget: 1000,
  snowballDebtId: 'debt1',
  strategy: 'avalanche',
  customOrder: [],
  recurringCharges: {},
  chargesByMonth: {},
  interestByMonth: {},
  adjustmentsByMonth: {},
  extraByMonth: {},
  paymentsByMonth: {},
  loggedMonths: [],
  loggedHistory: {},
  planStartMonth: '2026-11',
  affirmLoans: [],
  closedDebts: [],
}

describe('mergeDebtPlanStates', () => {
  it('merges Affirm loans by ID (union)', () => {
    const loan1: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
    }

    const loan2: AffirmLoan = {
      id: 'affirm2',
      name: 'Mattress',
      loanId: 'BCO6-S031',
      startMonth: '2026-02',
      lastPayment: '2027-01',
      startingBalance: 800,
      monthly: 80,
      remaining: 640,
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan1],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan1, loan2],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.affirmLoans).toHaveLength(2)
    expect(merged.affirmLoans.find((l) => l.id === 'affirm1')).toBeDefined()
    expect(merged.affirmLoans.find((l) => l.id === 'affirm2')).toBeDefined()
  })

  it('includes loans from both sides', () => {
    const loan1: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
    }

    const loan2: AffirmLoan = {
      id: 'affirm2',
      name: 'Mattress',
      loanId: 'BCO6-S031',
      startMonth: '2026-02',
      lastPayment: '2027-01',
      startingBalance: 800,
      monthly: 80,
      remaining: 640,
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan1],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan2],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.affirmLoans).toHaveLength(2)
    expect(merged.affirmLoans.find((l) => l.id === 'affirm1')).toBeDefined()
    expect(merged.affirmLoans.find((l) => l.id === 'affirm2')).toBeDefined()
  })

  it('prefers remote version when remote has newer timestamp', () => {
    const loanLocal: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
      updatedAt: '2026-11-18T09:00:00Z',
    }

    const loanRemote: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch (updated)',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 500, // Updated remaining balance
      updatedAt: '2026-11-18T11:00:00Z', // Newer
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanLocal],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanRemote],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.affirmLoans).toHaveLength(1)
    expect(merged.affirmLoans[0].remaining).toBe(500)
    expect(merged.affirmLoans[0].name).toBe('Couch (updated)')
  })

  it('merges closed debts by ID', () => {
    const debt1: Debt = {
      id: 'debt1',
      lender: 'Bank A',
      dueDay: 15,
      minimum: 50,
      extraPayment: 0,
      paidFromAccountId: 'acc1',
      chargeAccountId: 'acc1',
      type: 'credit-card',
      apr: 18.5,
      promoApr: null,
      promoEndsOn: null,
      balance: 1000,
    }

    const debt2: Debt = {
      id: 'debt2',
      lender: 'Bank B',
      dueDay: 20,
      minimum: 75,
      extraPayment: 0,
      paidFromAccountId: 'acc2',
      chargeAccountId: 'acc2',
      type: 'credit-card',
      apr: 15.0,
      promoApr: null,
      promoEndsOn: null,
      balance: 2000,
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      closedDebts: [debt1],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      closedDebts: [debt2],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.closedDebts).toHaveLength(2)
    expect(merged.closedDebts.find((d) => d.id === 'debt1')).toBeDefined()
    expect(merged.closedDebts.find((d) => d.id === 'debt2')).toBeDefined()
  })

  it('merges logged months (union)', () => {
    const local: DebtPlanState = {
      ...baseDebtPlan,
      loggedMonths: ['2026-09', '2026-10'],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      loggedMonths: ['2026-10', '2026-11'],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.loggedMonths).toEqual(
      expect.arrayContaining(['2026-09', '2026-10', '2026-11']),
    )
  })

  it('merges month-keyed dictionaries', () => {
    const local: DebtPlanState = {
      ...baseDebtPlan,
      chargesByMonth: {
        '2026-10': { debt1: 50 },
        '2026-11': { debt1: 60 },
      },
      paymentsByMonth: {
        '2026-10': { debt1: 100 },
      },
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      chargesByMonth: {
        '2026-11': { debt1: 65, debt2: 30 },
        '2026-12': { debt1: 55 },
      },
      paymentsByMonth: {
        '2026-11': { debt1: 110 },
      },
    }

    const merged = mergeDebtPlanStates(local, remote)

    // Charges should have all months
    expect(Object.keys(merged.chargesByMonth)).toEqual(
      expect.arrayContaining(['2026-10', '2026-11', '2026-12']),
    )
    // Remote values preferred for conflicts
    expect(merged.chargesByMonth['2026-11']).toEqual({ debt1: 65, debt2: 30 })
    // Local-only months preserved
    expect(merged.chargesByMonth['2026-10']).toEqual({ debt1: 50 })

    // Payments merged similarly
    expect(merged.paymentsByMonth['2026-10']).toEqual({ debt1: 100 })
    expect(merged.paymentsByMonth['2026-11']).toEqual({ debt1: 110 })
  })

  it('prefers remote for scalar fields', () => {
    const local: DebtPlanState = {
      ...baseDebtPlan,
      monthlyBudget: 1000,
      strategy: 'avalanche',
      snowballDebtId: 'debt1',
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      monthlyBudget: 1200,
      strategy: 'snowball',
      snowballDebtId: 'debt2',
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.monthlyBudget).toBe(1200)
    expect(merged.strategy).toBe('snowball')
    expect(merged.snowballDebtId).toBe('debt2')
  })

  it('handles empty affirm loans correctly', () => {
    const loan: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.affirmLoans).toHaveLength(1)
    expect(merged.affirmLoans[0].id).toBe('affirm1')
  })

  it('respects loan deletions via tombstones', () => {
    const loan1: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
    }

    const loan2: AffirmLoan = {
      id: 'affirm2',
      name: 'Mattress',
      loanId: 'BCO6-S031',
      startMonth: '2026-02',
      lastPayment: '2027-01',
      startingBalance: 800,
      monthly: 80,
      remaining: 640,
    }

    // Device A: Has both loans, deletes loan2
    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan1],
      removedLoanIds: ['affirm2'],
    }

    // Device B: Still has both loans (stale)
    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loan1, loan2],
    }

    const merged = mergeDebtPlanStates(local, remote)

    // Loan2 should stay deleted
    expect(merged.affirmLoans).toHaveLength(1)
    expect(merged.affirmLoans[0].id).toBe('affirm1')
    expect(merged.removedLoanIds).toContain('affirm2')
  })

  it('uses updatedAt timestamp to resolve edit conflicts', () => {
    const loanLocal: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
      updatedAt: '2026-11-18T10:00:00Z',
    }

    const loanRemote: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 500, // Different remaining balance
      updatedAt: '2026-11-18T12:00:00Z', // Newer timestamp
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanLocal],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanRemote],
    }

    const merged = mergeDebtPlanStates(local, remote)

    // Remote version should win (newer timestamp)
    expect(merged.affirmLoans).toHaveLength(1)
    expect(merged.affirmLoans[0].remaining).toBe(500)
    expect(merged.affirmLoans[0].updatedAt).toBe('2026-11-18T12:00:00Z')
  })

  it('prefers local when timestamps are equal', () => {
    const timestamp = '2026-11-18T10:00:00Z'

    const loanLocal: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
      updatedAt: timestamp,
    }

    const loanRemote: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 500,
      updatedAt: timestamp,
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanLocal],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanRemote],
    }

    const merged = mergeDebtPlanStates(local, remote)

    // Local should win on tie
    expect(merged.affirmLoans[0].remaining).toBe(600)
  })

  it('treats missing updatedAt as oldest', () => {
    const loanLocal: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 600,
      // No updatedAt
    }

    const loanRemote: AffirmLoan = {
      id: 'affirm1',
      name: 'Couch',
      loanId: 'ABC-123',
      startMonth: '2026-01',
      lastPayment: '2026-12',
      startingBalance: 1000,
      monthly: 100,
      remaining: 500,
      updatedAt: '2026-11-18T10:00:00Z',
    }

    const local: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanLocal],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      affirmLoans: [loanRemote],
    }

    const merged = mergeDebtPlanStates(local, remote)

    // Remote with timestamp should win over local without
    expect(merged.affirmLoans[0].remaining).toBe(500)
    expect(merged.affirmLoans[0].updatedAt).toBe('2026-11-18T10:00:00Z')
  })

  it('merges tombstone arrays from both sides', () => {
    const local: DebtPlanState = {
      ...baseDebtPlan,
      removedLoanIds: ['loan1', 'loan2'],
      removedClosedDebtIds: ['debt1'],
    }

    const remote: DebtPlanState = {
      ...baseDebtPlan,
      removedLoanIds: ['loan2', 'loan3'],
      removedClosedDebtIds: ['debt2'],
    }

    const merged = mergeDebtPlanStates(local, remote)

    expect(merged.removedLoanIds).toEqual(expect.arrayContaining(['loan1', 'loan2', 'loan3']))
    expect(merged.removedClosedDebtIds).toEqual(expect.arrayContaining(['debt1', 'debt2']))
  })
})
