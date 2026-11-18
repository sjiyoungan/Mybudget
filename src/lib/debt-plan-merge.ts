import type { Debt } from './budget'
import type { AffirmLoan, DebtPlanState } from './debt-plan'

/**
 * Merges two debt plan states with smart handling of Affirm loans and debts.
 * 
 * Strategy:
 * - affirmLoans: Merge by ID, union of both lists (no deletions - loans persist once added)
 * - closedDebts: Merge by ID, union of both lists
 * - History data (loggedHistory, chargesByMonth, paymentsByMonth, etc.):
 *   Merge by month key, preferring remote when month data differs (user likely editing current month)
 * - Scalar fields (monthlyBudget, strategy, etc.): Prefer remote (most recent user input)
 * 
 * This ensures Affirm loans added on one device appear on all devices within 30 seconds.
 */
export function mergeDebtPlanStates(
  local: DebtPlanState,
  remote: DebtPlanState,
): DebtPlanState {
  // Merge Affirm loans by ID (union - loans are never deleted, only closed)
  const affirmLoans = mergeLoans(local.affirmLoans, remote.affirmLoans)
  
  // Merge closed debts by ID (union)
  const closedDebts = mergeDebts(local.closedDebts, remote.closedDebts)
  
  // Merge logged months (union)
  const loggedMonths = [...new Set([...local.loggedMonths, ...remote.loggedMonths])]
  
  // Merge logged history by month key (prefer remote when different)
  const loggedHistory = { ...local.loggedHistory, ...remote.loggedHistory }
  
  // Merge month-keyed dictionaries (prefer remote for conflicts)
  const chargesByMonth = mergeMonthDicts(local.chargesByMonth, remote.chargesByMonth)
  const interestByMonth = mergeMonthDicts(local.interestByMonth, remote.interestByMonth)
  const adjustmentsByMonth = mergeMonthDicts(
    local.adjustmentsByMonth,
    remote.adjustmentsByMonth,
  )
  const paymentsByMonth = mergeMonthDicts(local.paymentsByMonth, remote.paymentsByMonth)
  const extraByMonth = { ...local.extraByMonth, ...remote.extraByMonth }
  
  // Merge recurring charges (prefer remote)
  const recurringCharges = { ...local.recurringCharges, ...remote.recurringCharges }
  
  // For scalar fields, prefer remote (most recent user action)
  return {
    monthlyBudget: remote.monthlyBudget,
    snowballDebtId: remote.snowballDebtId,
    strategy: remote.strategy,
    customOrder: remote.customOrder,
    planStartMonth: remote.planStartMonth,
    recurringCharges,
    chargesByMonth,
    interestByMonth,
    adjustmentsByMonth,
    extraByMonth,
    paymentsByMonth,
    loggedMonths,
    loggedHistory,
    affirmLoans,
    closedDebts,
  }
}

function mergeLoans(local: AffirmLoan[], remote: AffirmLoan[]): AffirmLoan[] {
  const merged = new Map<string, AffirmLoan>()
  
  // Add all local loans
  for (const loan of local) {
    merged.set(loan.id, loan)
  }
  
  // Add/update with remote loans
  for (const loan of remote) {
    const existing = merged.get(loan.id)
    if (!existing) {
      // New loan from remote
      merged.set(loan.id, loan)
    } else {
      // Both have this loan - prefer remote (more recent data)
      merged.set(loan.id, loan)
    }
  }
  
  return [...merged.values()]
}

function mergeDebts(local: Debt[], remote: Debt[]): Debt[] {
  const merged = new Map<string, Debt>()
  
  // Add all local debts
  for (const debt of local) {
    merged.set(debt.id, debt)
  }
  
  // Add/update with remote debts
  for (const debt of remote) {
    merged.set(debt.id, debt)
  }
  
  return [...merged.values()]
}

function mergeMonthDicts(
  local: Record<string, Record<string, number>>,
  remote: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const merged: Record<string, Record<string, number>> = { ...local }
  
  for (const [month, remoteData] of Object.entries(remote)) {
    if (!merged[month]) {
      // New month from remote
      merged[month] = remoteData
    } else {
      // Both have this month - merge debt IDs, prefer remote values
      merged[month] = { ...merged[month], ...remoteData }
    }
  }
  
  return merged
}
