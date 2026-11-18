# Sync Bug Root Cause & Fix (PR #5)

## Timeline of the Issue

**~10:30 PM ET (after PR #4 deployed)**:
1. Fresh browser: Add loan BCO6-S031 on `/debt` → count goes 52 → 53 ✓
2. After ~60s: Reload → still shows 53 ✓
3. After another ~60s: Reload → **back to 52, BCO6-S031 gone** ❌
4. Nobody edited on other devices during this window

## Root Cause: Two Critical Bugs in `syncUserAppStateFromCloud`

### Bug 1: Merged State Never Reached the UI

**Location**: `src/lib/user-app-state.ts` lines 313-320

**Before (buggy code)**:
```typescript
if (hasPendingEdit() || epoch !== seen) {
  const local = localAppState()
  const scheduled = epoch
  const saved = await upsertUserAppState(local)  // ← Merges internally!
  if (saved) clearPendingEdit(scheduled)
  return { state: local, fromCloud: false }     // ← Returns UNMERGED local ❌
}
```

**What happened**:
1. `upsertUserAppState(local)` correctly:
   - Fetches remote state (53 loans)
   - Merges local (52) + remote (53) → 53 loans
   - Saves merged state (53) to cloud ✓
   - Updates local cache: `cache = mergedState` ✓
   - Saves merged state to localStorage ✓

2. BUT then returns:
   - The **original unmerged `local`** state (52 loans)
   - With `fromCloud: false`

3. The contexts check:
   ```typescript
   if (!synced.fromCloud) return  // ← Skips UI update!
   setPlanState(synced.state.plan)
   ```

4. **Result**: UI cache and React state never updated, still shows 52 loans ❌

### Bug 2: `upsertUserAppState` Didn't Return Merged State

**Location**: `src/lib/user-app-state.ts` lines 274-293

**Before (buggy code)**:
```typescript
async function upsertUserAppState(state: UserAppState) {
  const read = await readCloudAppState()
  let mergedState = state

  if (read.status === 'ready') {
    mergedState = {
      budget: mergeBudgetStates(state.budget, read.state.budget),
      plan: mergeDebtPlanStates(state.plan, read.state.plan),
      spending: mergeSpendingStates(state.spending, read.state.spending),
    }
    cache = mergedState
    saveBudget(mergedState.budget)
    saveDebtPlan(mergedState.plan)
    saveSpending(mergedState.spending)
  }

  const saved = await upsertPaystubAppState(mergedState)
  await upsertDedicatedAppState(mergedState)
  return saved  // ← Only returns boolean, not merged state! ❌
}
```

Even though the merge happened internally, the caller couldn't access the merged result.

## The Complete Failure Scenario

**Device A** (fresh tab, new bundle):
1. 10:30 PM: Add loan BCO6-S031 → local state has 53 loans
2. Debounced push (400ms) → calls `upsertUserAppState`
   - Merges local (53) with cloud (maybe 52 or 53)
   - Saves 53 to cloud ✓
   - Returns 53 ✓

**Device B** (stale tab or old bundle):
1. 10:31 PM: Has 52 loans in cache, periodic pull (30s) fires
2. Calls `syncUserAppStateFromCloud`:
   - Has `hasPendingEdit()` true (stuck or real pending edit)
   - Calls `upsertUserAppState(local)` with 52 loans
   - `upsertUserAppState` internally:
     - Fetches cloud → 53 loans ✓
     - Merges 52 + 53 → 53 loans ✓
     - Saves 53 to cloud ✓
     - Updates internal cache ✓
     - **BUT returns original local (52) with `fromCloud: false`** ❌
   - Context sees `fromCloud: false` → **skips `setPlanState`** ❌
   - **React state and UI cache still 52 loans** ❌

3. 10:32 PM: Any push trigger (edit, pagehide, periodic)
   - Calls `upsertUserAppState` with cached **52 loans** (UI was never updated!)
   - Fetches cloud (53 loans)
   - Merges 52 (local, no timestamps) + 53 (remote, BCO6-S031 has timestamp)
   - Without `updatedAt` on old loans, conflict resolution is unpredictable
   - Pushes the result (likely 52) to cloud → **BCO6-S031 lost** ❌

## The Fix (PR #5)

### Fix 1: Return Merged State from `upsertUserAppState`

**After**:
```typescript
async function upsertUserAppState(state: UserAppState): Promise<{
  saved: boolean
  merged: UserAppState
}> {
  const read = await readCloudAppState()
  let mergedState = state

  if (read.status === 'ready') {
    mergedState = {
      budget: mergeBudgetStates(state.budget, read.state.budget),
      plan: mergeDebtPlanStates(state.plan, read.state.plan),
      spending: mergeSpendingStates(state.spending, read.state.spending),
    }
    cache = mergedState
    saveBudget(mergedState.budget)
    saveDebtPlan(mergedState.plan)
    saveSpending(mergedState.spending)
  }

  const saved = await upsertPaystubAppState(mergedState)
  await upsertDedicatedAppState(mergedState)
  return { saved, merged: mergedState }  // ← Return both!
}
```

### Fix 2: Use Merged State in `syncUserAppStateFromCloud`

**After**:
```typescript
if (hasPendingEdit() || epoch !== seen) {
  const local = localAppState()
  const scheduled = epoch
  const result = await upsertUserAppState(local)
  if (result.saved) clearPendingEdit(scheduled)
  // Return merged state so UI updates with remote changes
  return { state: result.merged, fromCloud: true }  // ← Fixed!
}
```

**Key change**: Returns `result.merged` with `fromCloud: true`, so contexts call `setPlanState(synced.state.plan)` and update the UI.

### Fix 3: Add `updatedAt` to New Loans

**In `completeAffirmLoan`** (`src/lib/debt-plan.ts` line 1888):
```typescript
return {
  id: input.id ?? `affirm-${crypto.randomUUID()}`,
  name: input.name.trim() || 'Amazon',
  loanId: input.loanId.trim(),
  startMonth,
  startDate,
  lastPayment,
  startingBalance,
  monthly,
  remaining,
  updatedAt: new Date().toISOString(),  // ← New!
  ...(input.needsSpending ? { needsSpending: true } : {}),
}
```

**Why this matters**:
- PR #4 added timestamp-based conflict resolution for loans
- But new loans had no `updatedAt`, treated as oldest
- When merging 52 old loans (no timestamps) + 53 (new loan with timestamp), conflict resolution could favor local
- Now every loan starts with a timestamp → newest always wins

## Verification - The Fixed Flow

**Device A** (any tab, new bundle):
1. Add loan BCO6-S031 with `updatedAt` → push → saves 53 to cloud ✓

**Device B** (any tab, new bundle):
1. Pull (30s or focus) → `syncUserAppStateFromCloud` runs
2. Calls `upsertUserAppState(local)` with 52 loans
3. `upsertUserAppState`:
   - Fetches cloud (53 loans) ✓
   - Merges 52 + 53 → 53 loans ✓
   - Saves 53 to cloud ✓
   - **Returns `{ saved: true, merged: <53 loans> }`** ✓
4. `syncUserAppStateFromCloud` **returns `{ state: <53 loans>, fromCloud: true }`** ✓
5. Context sees `fromCloud: true` → **calls `setPlanState`** → **UI updates to 53 loans** ✓
6. Later push: merges 53 (current) + 53 (cloud) → 53 stays ✓

## Old-Bundle Client Problem (Still Exists)

**This PR fixes new-bundle (post-PR-4) clients only.**

**Old-bundle clients (pre-PR-4)** have `mergeDebtPlanStates` that just returns `local` (never merges), so:
- Periodic pull: fetches cloud, ignores it, keeps local ❌
- Any push: sends stale local → overwrites cloud ❌

**Impact**:
- A tab that's been open since before PR #4 deployed (~10:30 PM ET, ~3 hours ago)
- Still has the old bundle (`mergeDebtPlanStates` returns `local`)
- Will overwrite cloud on next push (periodic, edit, or pagehide)

**Mitigation** (for future PR if needed):
1. **Version guard**: Add `syncVersion: 2` to every push; server rejects old versions
2. **Force reload**: Banner or redirect that forces old-bundle clients to reload
3. **Schema check**: Reject pushes where all `affirmLoans` lack `updatedAt` timestamps

**For now**: **User should reload or close any tabs opened before PR #4 deployed.**

## Action Required

### ✅ Done (PR #5 merged and deployed)
- Fixed `syncUserAppStateFromCloud` to return and apply merged state
- Added `updatedAt` to new loans
- All 3 CI checks passed
- Deployed to Vercel at https://mybudget-phi.vercel.app

### ⚠️ User Action Needed
**Reload or close any tabs that have been open since before ~10:30 PM ET** (before PR #4 deployed). These tabs run the old bundle and can still overwrite cloud data.

**How to identify old tabs**:
- Check bundle hash in DevTools Network tab: old bundle is NOT `/assets/index-D1b2rLJe.js`
- Or just reload all tabs to be safe

### ✅ After Reload
- All tabs will have the fix
- The 53rd loan (BCO6-S031) will sync to all devices within 30 seconds
- Stale devices won't overwrite cloud anymore
- Deletions stay deleted, edits win by timestamp

## Files Changed (PR #5)

- `src/lib/user-app-state.ts`: Return merged state from `upsertUserAppState`, use it in `syncUserAppStateFromCloud`
- `src/lib/debt-plan.ts`: Add `updatedAt` to `completeAffirmLoan`

## Testing

- ✅ All 13 debt-plan-merge tests pass
- ✅ TypeScript compilation passes
- ✅ No runtime errors
- ✅ Backward compatible (all new fields optional)

## Summary

**Root cause**: Two sync bugs caused merged state to never reach the UI, so stale cached data was pushed later and overwrote cloud.

**Fix**: Return and apply merged state, add timestamps to new loans.

**Result**: New-bundle devices will sync correctly within 30 seconds. Old-bundle tabs need manual reload.

**Deployed**: PR #5 merged to main, live at https://mybudget-phi.vercel.app
