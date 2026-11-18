import type { Debt } from './budget'
import type { AffirmLoan, DebtPlanState } from './debt-plan'

/**
 * Merges two debt plan states with smart handling of Affirm loans and debts.
 * 
 * Strategy:
 * - affirmLoans: Merge by ID with updatedAt timestamps, respecting tombstones
 * - closedDebts: Merge by ID, respecting tombstones
 * - Tombstones (removedLoanIds, removedClosedDebtIds): Union, prevents resurrection
 * - History data (loggedHistory, chargesByMonth, paymentsByMonth, etc.):
 *   Merge by month key, preferring remote when month data differs
 * - Scalar fields (monthlyBudget, strategy, etc.): Prefer remote (most recent user input)
 * 
 * This ensures:
 * - Loans added on one device appear on all devices
 * - Loans deleted on one device stay deleted
 * - Edits with newer timestamps win conflicts
 */
export function mergeDebtPlanStates(
  local: DebtPlanState,
  remote: DebtPlanState,
): DebtPlanState {
  // Merge tombstone lists (union)
  const removedLoanIds = new Set([
    ...(local.removedLoanIds ?? []),
    ...(remote.removedLoanIds ?? []),
  ])
  const removedClosedDebtIds = new Set([
    ...(local.removedClosedDebtIds ?? []),
    ...(remote.removedClosedDebtIds ?? []),
  ])
  
  // Merge Affirm loans by ID with timestamp-based conflict resolution
  const affirmLoans = mergeLoans(
    local.affirmLoans,
    remote.affirmLoans,
    removedLoanIds,
  )
  
  // Merge closed debts by ID
  const closedDebts = mergeDebts(
    local.closedDebts,
    remote.closedDebts,
    removedClosedDebtIds,
  )
  
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
    removedLoanIds: [...removedLoanIds],
    removedClosedDebtIds: [...removedClosedDebtIds],
  }
}

function mergeLoans(
  local: AffirmLoan[],
  remote: AffirmLoan[],
  removedIds: Set<string>,
): AffirmLoan[] {
  const merged = new Map<string, AffirmLoan>()
  
  // Add all local loans (except deleted ones)
  for (const loan of local) {
    if (!removedIds.has(loan.id)) {
      merged.set(loan.id, loan)
    }
  }
  
  // Merge with remote loans
  for (const loan of remote) {
    if (removedIds.has(loan.id)) {
      // Remote loan is deleted - remove from merged if present
      merged.delete(loan.id)
    } else {
      const existing = merged.get(loan.id)
      if (!existing) {
        // New loan from remote
        merged.set(loan.id, loan)
      } else {
        // Both have this loan - take version with later updatedAt
        const localTime = existing.updatedAt ?? ''
        const remoteTime = loan.updatedAt ?? ''
        if (remoteTime > localTime) {
          merged.set(loan.id, loan)
        }
        // If localTime >= remoteTime, keep existing (local wins ties)
      }
    }
  }
  
  return [...merged.values()]
}

function mergeDebts(
  local: Debt[],
  remote: Debt[],
  removedIds: Set<string>,
): Debt[] {
  const merged = new Map<string, Debt>()
  
  // Add all local debts (except deleted ones)
  for (const debt of local) {
    if (!removedIds.has(debt.id)) {
      merged.set(debt.id, debt)
    }
  }
  
  // Merge with remote debts
  for (const debt of remote) {
    if (removedIds.has(debt.id)) {
      // Remote debt is deleted - remove from merged if present
      merged.delete(debt.id)
    } else {
      // Prefer remote version (closedDebts are historical, rarely edited)
      merged.set(debt.id, debt)
    }
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
