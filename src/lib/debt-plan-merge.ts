import type { DebtPlanState } from './debt-plan'

/**
 * Merges two debt plan states.
 * 
 * Strategy: Debt plan doesn't have updatedAt timestamps.
 * Since debt plan state is complex and interdependent (chargesByMonth,
 * paymentsByMonth, loggedHistory all relate to each other), we prefer
 * local state to avoid data corruption. A user should only edit the
 * debt plan on one device at a time.
 * 
 * Future: Could merge loggedHistory by month keys, but for now we
 * take a conservative approach.
 */
export function mergeDebtPlanStates(
  local: DebtPlanState,
  _remote: DebtPlanState,
): DebtPlanState {
  // Prefer local state for now (conservative approach)
  // The debt plan is complex and editing on multiple devices simultaneously
  // is not a primary use case
  return local
}
