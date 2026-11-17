import type { BudgetState } from './budget'

/**
 * Merges two budget states.
 * 
 * Strategy: Budget items don't have individual updatedAt timestamps.
 * Use top-level updatedAt to determine which version is newer.
 * If neither has updatedAt, prefer local (defensive merge).
 */
export function mergeBudgetStates(
  local: BudgetState,
  remote: BudgetState,
): BudgetState {
  const localTime = local.updatedAt ?? ''
  const remoteTime = remote.updatedAt ?? ''

  // If remote is newer, use it entirely
  if (remoteTime > localTime) {
    return remote
  }

  // Otherwise keep local (includes tie case and missing timestamps)
  return local
}
