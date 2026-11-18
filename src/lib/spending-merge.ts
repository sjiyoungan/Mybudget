import type { SpendingState } from './spending'

/**
 * Merges two spending states, resolving conflicts by item-level updatedAt timestamps.
 * Respects tombstones (removed*Ids) to preserve deletions across devices.
 * 
 * Strategy:
 * - For each item type (transactions, categories, rules, uploads):
 *   - Take the version with the latest updatedAt timestamp
 *   - Exclude items that are in removed*Ids from either state
 * - Merge removed*Ids arrays (union)
 * - Use the latest top-level updatedAt
 */
export function mergeSpendingStates(
  local: SpendingState,
  remote: SpendingState,
): SpendingState {
  // Merge tombstone lists (union)
  const removedTransactionIds = new Set([
    ...(local.removedTransactionIds ?? []),
    ...(remote.removedTransactionIds ?? []),
  ])
  const removedCategoryIds = new Set([
    ...(local.removedCategoryIds ?? []),
    ...(remote.removedCategoryIds ?? []),
  ])
  const removedRuleIds = new Set([
    ...(local.removedRuleIds ?? []),
    ...(remote.removedRuleIds ?? []),
  ])
  const removedUploadIds = new Set([
    ...(local.removedUploadIds ?? []),
    ...(remote.removedUploadIds ?? []),
  ])

  // Merge transactions
  const transactions = mergeItems(
    local.transactions,
    remote.transactions,
    removedTransactionIds,
  )

  // Merge categories
  const categories = mergeItems(
    local.categories,
    remote.categories,
    removedCategoryIds,
  )

  // Merge rules
  const rules = mergeItems(local.rules, remote.rules, removedRuleIds)

  // Merge uploads
  const uploads = mergeItems(local.uploads, remote.uploads, removedUploadIds)

  const merchants = mergeItems(local.merchants ?? [], remote.merchants ?? [], new Set())
  const hiddenMerchantNames = [
    ...new Set([
      ...(local.hiddenMerchantNames ?? []).map((name) => name.toLowerCase()),
      ...(remote.hiddenMerchantNames ?? []).map((name) => name.toLowerCase()),
    ]),
  ]

  // Use the latest top-level updatedAt
  const updatedAt =
    local.updatedAt && remote.updatedAt
      ? local.updatedAt > remote.updatedAt
        ? local.updatedAt
        : remote.updatedAt
      : local.updatedAt ?? remote.updatedAt

  return {
    transactions,
    categories,
    rules,
    uploads,
    ...(merchants.length > 0 ? { merchants } : {}),
    ...(hiddenMerchantNames.length > 0 ? { hiddenMerchantNames } : {}),
    removedTransactionIds: [...removedTransactionIds],
    removedCategoryIds: [...removedCategoryIds],
    removedRuleIds: [...removedRuleIds],
    removedUploadIds: [...removedUploadIds],
    ...(updatedAt ? { updatedAt } : {}),
  }
}

type ItemWithId = { id: string; updatedAt?: string }

function mergeItems<T extends ItemWithId>(
  localItems: T[],
  remoteItems: T[],
  removedIds: Set<string>,
): T[] {
  const merged = new Map<string, T>()

  // Add all local items
  for (const item of localItems) {
    if (!removedIds.has(item.id)) {
      merged.set(item.id, item)
    }
  }

  // Merge with remote items (take newer version based on updatedAt)
  for (const item of remoteItems) {
    if (removedIds.has(item.id)) {
      // Remote item is deleted - remove from merged if present
      merged.delete(item.id)
    } else {
      const existing = merged.get(item.id)
      if (!existing) {
        // New item from remote
        merged.set(item.id, item)
      } else {
        // Both have this item - take the one with later updatedAt
        const localTime = existing.updatedAt ?? ''
        const remoteTime = item.updatedAt ?? ''
        if (remoteTime > localTime) {
          merged.set(item.id, item)
        }
        // If localTime >= remoteTime, keep existing (local wins ties)
      }
    }
  }

  return [...merged.values()]
}
