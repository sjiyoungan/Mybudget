# Sync Architecture Root Cause Analysis

## Current Symptoms (10:44 PM ET, after PRs #4 and #5)

1. **Headless browser** on `/debt`: Shows **56 Affirm loans**
2. **User's computer** (reloaded): Shows **53 Affirm loans**  
3. **Missing loans**: 3 old loans exist only in headless browser:
   - "Made by merry" (no loan ID)
   - OQG5-Q7FI
   - IU7A-GBU4
4. **Earlier symptom**: Loan added, persisted 60s, then vanished
5. **Cloud storage**: `user_app_state` table returns 404 (doesn't exist in prod)
6. **Actual store**: Paystubs `__app_state__` row is the de facto source of truth

## Question 1: Where is the debt plan actually read/written?

### On Page Load (Initial Mount)

**Code path**: `DebtPlanProvider` → `useState(() => loadDebtPlan())`

```typescript
// Line 40 in debt-plan-context.tsx
const [plan, setPlanState] = useState<DebtPlanState>(() => loadDebtPlan())

// loadDebtPlan (debt-plan.ts:465)
export function loadDebtPlan(): DebtPlanState {
  const fallback = defaultDebtPlan()
  try {
    const raw = localStorage.getItem(PLAN_KEY)  // ← Reads localStorage FIRST
    if (!raw) return fallback
    const loaded = parseDebtPlan(JSON.parse(raw))
    return loaded ?? fallback
  } catch {
    return fallback
  }
}
```

**Reads from**: `localStorage['mybudget.plan.v1']` ONLY  
**Does NOT read**: Cloud (neither paystubs nor user_app_state)

### After Load (Cloud Sync)

**Code path**: `DebtPlanProvider` useEffect → `syncUserAppStateFromCloud()`

```typescript
// Lines 47-60 in debt-plan-context.tsx
useEffect(() => {
  if (loading || !supabase || !user) return
  const synced = await syncUserAppStateFromCloud()
  if (!synced.fromCloud) return
  setPlanState(synced.state.plan)  // ← Updates state with cloud data
}, [loading, user])
```

**Flow in `syncUserAppStateFromCloud`** (user-app-state.ts:312):

1. **Check pending edit**:
   ```typescript
   if (hasPendingEdit() || epoch !== seen) {
     const local = localAppState()  // ← Reads localStorage again!
     const result = await upsertUserAppState(local)
     return { state: result.merged, fromCloud: true }
   }
   ```

2. **Read cloud** via `readCloudAppState()` (line 187):
   ```typescript
   async function readCloudAppState(): Promise<CloudRead> {
     const dedicated = await readDedicatedRow()  // user_app_state table
     const paystub = await fetchPaystubDataByDateResult(APP_STATE_PAY_DATE)
     
     // Prefers dedicated row, falls back to paystub
     return {
       status: 'ready',
       state: {
         budget: dedicatedBudget ?? paystubBudget ?? local.budget,
         plan: dedicatedPlan ?? paystubPlan ?? local.plan,  // ← local fallback!
         spending: paystubSpending ?? local.spending,
       }
     }
   }
   ```

3. **Apply cloud state**:
   ```typescript
   applyLocal(read.state)  // Saves to localStorage, updates cache
   ```

**Reads from**: 
- First: `user_app_state` table (404 in prod)
- Second: Paystubs `__app_state__` row
- Fallback: localStorage (via `localAppState()`)

### On Push (User Edit)

**Code path**: `setPlan()` → `saveDebtPlan()` → `scheduleUserAppStatePush()` → `finishPush()`

```typescript
// Debounced 400ms push
async function finishPush(scheduled: number) {
  const result = await upsertUserAppState(localAppState())  // ← Reads localStorage!
  if (result.saved) clearPendingEdit(scheduled)
}
```

**`upsertUserAppState` flow** (line 274):
```typescript
async function upsertUserAppState(state: UserAppState) {
  const read = await readCloudAppState()  // ← Reads cloud
  let mergedState = state
  
  if (read.status === 'ready') {
    mergedState = {
      plan: mergeDebtPlanStates(state.plan, read.state.plan),  // ← Merge!
      // ...
    }
    cache = mergedState
    saveBudget(mergedState.budget)
    saveDebtPlan(mergedState.plan)  // ← Saves to localStorage
    saveSpending(mergedState.spending)
  }
  
  const saved = await upsertPaystubAppState(mergedState)  // ← Writes to cloud
  await upsertDedicatedAppState(mergedState)  // ← Writes to user_app_state (fails)
  return { saved, merged: mergedState }
}
```

**Writes to**:
1. localStorage (via `saveDebtPlan`)
2. Paystubs `__app_state__` row
3. `user_app_state` table (silently fails if table missing)

### On Periodic Pull (Every 30s)

**Code path**: `pullAndMergeRemoteChanges()` (line 390)

```typescript
export async function pullAndMergeRemoteChanges(): Promise<void> {
  const read = await readCloudAppState()  // ← Reads cloud
  if (read.status !== 'ready') return
  
  const local = localAppState()  // ← Reads localStorage
  
  const merged: UserAppState = {
    plan: mergeDebtPlanStates(local.plan, read.state.plan),  // ← Merge!
  }
  
  cache = merged
  saveBudget(merged.budget)
  saveDebtPlan(merged.plan)  // ← Saves to localStorage
  saveSpending(merged.spending)
}
```

**Reads from**: Cloud (paystubs) + localStorage  
**Writes to**: localStorage only (doesn't push to cloud)

## Question 2: Why do two freshly reloaded devices show different loan lists?

### Root Cause: localStorage is Authoritative on Load

**Device A** (headless browser, 56 loans):
1. Page load → `loadDebtPlan()` → reads localStorage → **56 loans** (includes 3 old loans)
2. Cloud sync → `syncUserAppStateFromCloud()` → reads cloud (53 loans)
3. **Problem**: If `hasPendingEdit()` returns true (stuck flag), it does:
   ```typescript
   const local = localAppState()  // ← 56 loans from localStorage
   const result = await upsertUserAppState(local)  // ← Merges 56 + 53
   ```
4. Merge: 56 (local, no timestamps) + 53 (cloud) → **union = 56 loans**
5. Saves 56 to cloud → **3 old loans resurrected**
6. Returns 56 to UI

**Device B** (user's computer, 53 loans):
1. Page load → `loadDebtPlan()` → reads localStorage → **53 loans** (correct)
2. Cloud sync → reads cloud (maybe 53, maybe 56 if A pushed first)
3. If cloud has 56, merge 53 + 56 → 56, but UI shows 53 if no pending edit
4. If cloud has 53, stays at 53

**The divergence**:
- **localStorage on each device is independent**
- **Page load reads localStorage BEFORE cloud sync**
- **UI shows localStorage until cloud sync completes** (may take 100-500ms)
- **If pending edit flag is stuck, local state takes precedence in merge**

### Concrete Race Condition

**Scenario A: Pending Edit Flag Stuck**

Device A:
1. Previous session: Edit made, `PENDING_KEY` set to '1'
2. Push maybe failed or was interrupted
3. Flag never cleared (clearPendingEdit checks `scheduled === epoch`, which changed)
4. Next load: `hasPendingEdit()` returns true forever
5. Cloud sync: Uses localStorage (56) as source, merges, overwrites cloud

**Scenario B: localStorage Stale from Old Session**

Device A:
1. Weeks ago: Had 56 loans in localStorage
2. Cloud sync never ran or failed
3. User closed tab before push completed
4. Today: Page load reads stale localStorage (56 loans)
5. Cloud has 53 (correct)
6. Merge: 56 + 53 → union → 56
7. Push: Overwrites cloud with 56

## Question 3: Is localStorage treated as authoritative?

### YES, in multiple critical places:

1. **On page load** (line 40, debt-plan-context.tsx):
   ```typescript
   const [plan, setPlanState] = useState(() => loadDebtPlan())
   ```
   UI shows localStorage immediately, before cloud sync.

2. **In `localAppState()`** (line 107, user-app-state.ts):
   ```typescript
   function localAppState(): UserAppState {
     return {
       plan: cache?.plan ?? loadDebtPlan(),  // ← Always reads localStorage
     }
   }
   ```
   Called by:
   - `syncUserAppStateFromCloud` when `hasPendingEdit()`
   - `finishPush` (every debounced push)
   - `pullAndMergeRemoteChanges` (every 30s)

3. **In `readCloudAppState` fallback** (line 213):
   ```typescript
   const local = localAppState()  // ← localStorage
   return {
     status: 'ready',
     state: {
       plan: dedicatedPlan ?? paystubPlan ?? local.plan,  // ← Falls back to localStorage!
     }
   }
   ```
   If cloud read fails or returns null, uses localStorage.

4. **In `hasPendingEdit()`** (line 66):
   ```typescript
   function hasPendingEdit() {
     return localStorage.getItem(PENDING_KEY) === '1'
   }
   ```
   If this flag is stuck, localStorage becomes authoritative in cloud sync.

### The Fundamental Problem:

**localStorage is used as both**:
- **Offline cache** (intended)
- **Source of truth on load** (bug)
- **Merge source for cloud writes** (bug)
- **Fallback when cloud is empty** (bug - should be opposite)

**Should be**:
- **Cloud is source of truth**
- **localStorage is optimistic local cache**
- **On load**: Read cloud first, fall back to localStorage only if offline
- **On push**: Merge against fresh cloud read, never trust stale localStorage

## Question 4: Race conditions between push/pull/focus/pagehide?

### YES, multiple races:

#### Race 1: 400ms Debounced Push vs 30s Periodic Pull

**Timeline**:
```
T+0ms:   User edits → scheduleUserAppStatePush() → sets 400ms timer
T+100ms: Periodic pull fires (every 30s)
         → Reads cloud (old state)
         → Reads localStorage (new edit)
         → Merges, saves to localStorage
T+400ms: Push fires
         → Reads localStorage (merged state)
         → Reads cloud (old state, or maybe pull's write landed)
         → Merges again
         → Writes to cloud
```

**Problem**: Pull and push both read + merge + write, but pull doesn't write to cloud.

#### Race 2: Focus Pull vs Debounced Push

**Timeline**:
```
T+0ms:   User switches to another tab (tab backgrounded)
T+200ms: User edits in other tab, pushes to cloud
T+300ms: User switches back → focus event → pullAndMergeRemoteChanges()
         → Reads cloud (new state from other tab)
         → Reads localStorage (stale)
         → Merges stale + new → writes to localStorage
T+400ms: Debounced push from T+0ms fires (timer was set before focus)
         → Reads localStorage (merged, but maybe stale if edit was local)
         → Writes to cloud → might overwrite other tab's changes
```

**Problem**: Debounced push timer doesn't cancel on focus pull.

#### Race 3: Pagehide Push vs Periodic Pull

**Timeline**:
```
T+0ms:   User edits → scheduleUserAppStatePush() → 400ms timer
T+200ms: User closes tab → pagehide event
         → finishPush(epoch) fires immediately
         → But epoch might have changed if pull happened
T+200ms: Also, periodic pull might be in-flight
         → Both read cloud simultaneously
         → Both merge independently
         → Both write (to localStorage and/or cloud)
         → Last writer wins
```

**Problem**: No coordination between pagehide push and ongoing pulls.

#### Race 4: Multiple Tabs, Same Device

**Timeline**:
```
Tab A:   Edit → debounced push in 400ms
Tab B:   Edit same data → debounced push in 400ms
T+400ms: Both pushes fire
         → Tab A: Reads cloud, merges, writes
         → Tab B: Reads cloud (maybe sees A's write, maybe not), merges, writes
         → Last write wins, one tab's edit lost
```

**Problem**: No optimistic concurrency control. No `updated_at` check on write.

#### Race 5: Pending Edit Flag Never Clears

**Timeline**:
```
T+0ms:   Edit → markPendingEdit() → epoch=1, PENDING_KEY='1'
T+400ms: Push → scheduled=1, epoch=1 → write succeeds
         → clearPendingEdit(1) → but epoch changed to 2 (another edit happened)
         → Flag NOT cleared
T+30s:   Periodic pull → syncUserAppStateFromCloud()
         → hasPendingEdit() = true
         → Uses localStorage as source → overwrites cloud
```

**Problem**: `epoch` can change between `markPendingEdit` and `clearPendingEdit`, leaving flag stuck.

## Summary of Root Causes

### 1. **localStorage is Source of Truth on Load**
   - `loadDebtPlan()` reads localStorage, not cloud
   - UI shows stale localStorage until cloud sync completes
   - If cloud sync uses localStorage in merge, stale data propagates

### 2. **Pending Edit Flag Can Get Stuck**
   - `clearPendingEdit(scheduled)` only clears if `scheduled === epoch`
   - If another edit happens between push schedule and clear, epoch changes
   - Stuck flag causes all future syncs to treat localStorage as authoritative

### 3. **No Optimistic Concurrency Control**
   - Writes don't check `updated_at` or version on paystubs row
   - Last write wins, even if it's based on stale data
   - Multiple tabs can overwrite each other

### 4. **localStorage Used as Merge Source**
   - `localAppState()` always reads localStorage
   - Every push, pull, and sync merges localStorage with cloud
   - Stale localStorage data propagates to cloud

### 5. **Union Merge Without Tombstones Was Incomplete**
   - Tombstones exist for new deletes, but not for old localStorage state
   - Old loans in localStorage that were deleted weeks ago resurrect
   - No "canonical delete" in cloud that prevents resurrection

### 6. **Multiple Concurrent Writers**
   - Debounced push (400ms), periodic pull (30s), focus pull, pagehide push
   - No coordination or locking
   - Last write wins, but "last" is undefined due to network/timing variance

### 7. **Fallback Logic is Backwards**
   - `readCloudAppState` falls back to localStorage if cloud is empty
   - Should be: localStorage only used if cloud is unreachable (offline)

## Correct Architecture (Proposed)

### Principle: Cloud is Source of Truth

1. **On Load**:
   - Read cloud FIRST
   - Fall back to localStorage only if offline/error
   - Never show localStorage before attempting cloud read
   - Clear localStorage if cloud read succeeds (cloud overwrites local)

2. **On Edit**:
   - Update UI optimistically (localStorage for offline)
   - Debounced push: Read cloud, merge, write with optimistic concurrency
   - If write fails (conflict), re-read cloud, re-merge, retry

3. **On Pull** (periodic, focus, visibility):
   - Read cloud
   - Overwrite localStorage (cloud is authoritative)
   - Don't merge localStorage into cloud unless there's a pending edit

4. **Pending Edit Tracking**:
   - Don't use epoch-based flag (error-prone)
   - Use in-flight promise or dirty flag cleared immediately after successful write
   - Or use optimistic concurrency (version check) instead of flag

5. **Optimistic Concurrency**:
   - Add `updated_at` or `version` to paystubs row
   - On write: Check if `updated_at` matches what we last read
   - If mismatch: Re-read, re-merge, retry
   - Prevents stale writes

6. **Tombstones**:
   - Keep `removedLoanIds` and `removedClosedDebtIds`
   - On merge: Respect tombstones (deleted stays deleted)
   - On initial cloud write: Include tombstones for anything not in cloud but in localStorage
   - This prevents resurrection of old localStorage data

### Implementation Plan

#### Phase 1: Make Cloud Authoritative on Load

- Change `DebtPlanProvider` initial state to `null` or loading indicator
- On mount: Read cloud first, show loading spinner
- Only after cloud read: Initialize state
- localStorage becomes fallback for offline only

#### Phase 2: Fix Pending Edit Flag

- Replace epoch-based flag with simpler dirty tracking
- Clear flag immediately after successful write, not based on epoch
- Or remove flag entirely, always merge localStorage with cloud on push

#### Phase 3: Add Optimistic Concurrency

- Add `sync_version` or `updated_at` to paystubs row
- On read: Record version
- On write: Check version, fail if changed
- On conflict: Re-read, re-merge, retry

#### Phase 4: Simplify Merge Logic

- Pull: Overwrite localStorage with cloud (no merge)
- Push: Merge localStorage with cloud, but trust cloud on conflicts
- Exception: If pending edit, trust localStorage for that specific edit

#### Phase 5: Test Multi-Device Scenarios

- Simulate 2-3 devices with stale localStorage
- Test: Device A adds loan, Device B has stale localStorage with old deleted loans
- Verify: Cloud remains authoritative, old loans don't resurrect

## CRITICAL: Additional Evidence (10:45 PM ET)

### Symptom: Two Reloaded Devices Show Different Data

**User's report**:
- Headless browser (reloaded twice, 45s apart): Shows **56 loans** consistently
- User's computer (reloaded): Shows **53 loans** consistently
- Neither converges after 45s (well past the 30s periodic pull interval)

### Hypothesis: Schema Migration Failure or Global Shared Row

**Paystubs table schema evolution**:

1. **First migration** (`20260823150000_paystubs.sql`):
   ```sql
   create table public.paystubs (
     id uuid primary key,
     pay_date date not null unique,  -- ← GLOBAL UNIQUE CONSTRAINT
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   -- RLS: (true) -- ← ALL USERS CAN READ/WRITE ALL ROWS
   ```

2. **Second migration** (`20260823180000_paystubs_auth.sql`):
   ```sql
   alter table public.paystubs add column user_id uuid;
   alter table public.paystubs drop constraint paystubs_pay_date_key;  -- ← Drop global unique
   create unique index paystubs_user_pay_date_key 
     on public.paystubs (user_id, pay_date);  -- ← Per-user unique
   -- RLS: (auth.uid() = user_id) -- ← Per-user isolation
   ```

### Code Behavior with Old Schema (No user_id Column)

The code has **fallback logic** in `paystub.ts`:

**On READ** (line 306):
```typescript
if (paystubsUserIdColumn !== 'no') {
  // Try with user_id (new schema)
  const scoped = await supabase
    .from('paystubs')
    .select('data')
    .eq('user_id', userId)
    .eq('pay_date', payDate)
    .maybeSingle()
  if (!scoped.error) {
    paystubsUserIdColumn = 'yes'
    return { ok: true, data: scoped.data?.data ?? null }
  }
  if (isMissingUserIdColumn(scoped.error)) {
    paystubsUserIdColumn = 'no'  // ← Detected old schema
  }
}
// Fall back to old schema (line 321)
const unscoped = await supabase
  .from('paystubs')
  .select('data')
  .eq('pay_date', payDate)  // ← NO user_id filter!
  .maybeSingle()
```

**On WRITE** (line 358):
```typescript
if (paystubsUserIdColumn !== 'no') {
  // Try with user_id (new schema)
  const scoped = await supabase.from('paystubs').upsert(
    { ...row, user_id: userId },
    { onConflict: 'user_id,pay_date' },
  )
  if (!scoped.error) return true
  if (isMissingUserIdColumn(scoped.error)) {
    paystubsUserIdColumn = 'no'  // ← Detected old schema
  }
}
// Fall back to old schema (line 374)
const { error } = await supabase
  .from('paystubs')
  .upsert(row, { onConflict: 'pay_date' })  // ← GLOBAL UPSERT!
```

### What Happens with Old Schema

**If production is on the OLD schema** (no `user_id` column):

1. **All users share ONE global row** for `pay_date = '1970-01-01'`
2. **RLS allows all users to read/write the shared row** (policy: `using (true)`)
3. **Every user's write overwrites the previous user's data**
4. **Reads return the last user's data**

**Timeline explaining the divergence**:

```
T-5min:  User A logs in, reads paystubs → gets 56 loans (from previous session)
         localStorage: 56 loans
         UI: 56 loans

T-2min:  User B logs in, reads paystubs → gets 53 loans (from another user!)
         localStorage: 53 loans
         UI: 53 loans

T-1min:  User A edits, pushes → writes 56 loans to paystubs global row
         Cloud now has: 56 loans

T+0:     User B reloads
         - Reads localStorage: 53 loans
         - Reads paystubs: 56 loans (from User A's write!)
         - Merges: 53 + 56 = 56 loans
         - But hasPendingEdit() might be true → uses localStorage (53) as source
         - Writes 53 to paystubs → overwrites User A's 56

T+30s:   User A's periodic pull
         - Reads paystubs: 53 loans (User B overwrote it)
         - Merges with localStorage: 56
         - Result: 56 loans (local wins)
         - Doesn't push (pull only updates localStorage)

T+45s:   Both reload
         - User A: Reads localStorage (56), then paystubs (53), shows localStorage first
         - User B: Reads localStorage (53), then paystubs (maybe 56 if A pushed), shows localStorage first
         - Neither converges because they're in a write-write conflict loop
```

### Concrete Evidence to Check

**In Supabase console**:

1. **Check if `user_id` column exists**:
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'paystubs';
   ```

2. **Check unique constraints**:
   ```sql
   SELECT constraint_name, constraint_type
   FROM information_schema.table_constraints
   WHERE table_name = 'paystubs';
   ```

3. **Count rows for `pay_date = '1970-01-01'`**:
   ```sql
   SELECT COUNT(*), user_id 
   FROM paystubs 
   WHERE pay_date = '1970-01-01'
   GROUP BY user_id;
   ```
   - **If no `user_id` column**: Will error or return NULL
   - **If one row with NULL `user_id`**: Old schema, global shared row!
   - **If multiple rows per user**: New schema working correctly

4. **Check RLS policies**:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'paystubs';
   ```

### Root Cause Confirmed

**Primary issue**: Production is likely on **OLD schema without `user_id` column**, so:
- All users share one global row for app state
- Last write wins across ALL users
- No per-user isolation
- Explains why two devices show different data after reload

**Secondary issues** (still true even with correct schema):
- localStorage is authoritative on load
- Pending edit flag can get stuck
- No optimistic concurrency control
- Multiple concurrent writers

## Next Steps

1. **Verify schema**: Check if `user_id` column exists in production
2. **Run second migration**: If missing, run `20260823180000_paystubs_auth.sql`
3. **After schema fix**: Implement Phase 1-4 architecture changes
4. **Create architectural test cases**
5. **Open PR with detailed root-cause writeup**
6. **DO NOT MERGE until user approves the approach**
7. **Report root cause and plan to user**
