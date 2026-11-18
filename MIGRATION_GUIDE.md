# Migration Guide: Cloud-Authoritative Sync Architecture

## Summary

This migration fixes the sync architecture to make cloud the source of truth, adds per-user isolation with RLS, and implements optimistic concurrency control.

## Critical Issues Fixed

1. **All users sharing one global paystubs row** - Every user's write overwrote every other user's data
2. **localStorage authoritative on load** - Stale localStorage could overwrite cloud
3. **No optimistic concurrency** - Last write wins, even if based on stale data
4. **Stuck pending-edit flag** - Could permanently make localStorage authoritative
5. **Multiple race conditions** - Between 400ms push, 30s pull, focus, and pagehide
6. **Old tabs running indefinitely** - No version check to force reload

## Database Changes

### Before

```
paystubs table:
- id uuid (PK)
- pay_date date (UNIQUE globally)  ← All users share row for '1970-01-01'
- data jsonb
- updated_at timestamptz

RLS: using (true)  ← Anyone can read/write everything!
```

### After

```
user_app_state table:
- user_id uuid (PK, FK to auth.users)
- budget jsonb
- plan jsonb
- spending jsonb
- sync_version bigint (for optimistic concurrency)
- updated_at timestamptz

RLS: using (auth.uid() = user_id)  ← Per-user isolation

paystubs table:
- id uuid (PK)
- pay_date date
- user_id uuid (FK to auth.users, NOT NULL)
- data jsonb
- updated_at timestamptz
- UNIQUE (user_id, pay_date)  ← Per-user unique constraint

RLS: using (auth.uid() = user_id)  ← Per-user isolation
```

## Client Architecture Changes

### Before: localStorage Authoritative

```
Page Load:
1. Read localStorage → Show immediately
2. 100-500ms later: Sync with cloud (maybe)
3. If hasPendingEdit(): Use localStorage, overwrite cloud

Push:
1. Read localStorage
2. Merge with cloud
3. Write to cloud (last write wins, no version check)

Pull:
1. Read cloud
2. Merge with localStorage
3. Write to localStorage only (don't update UI unless fromCloud=true)
```

### After: Cloud Authoritative

```
Page Load:
1. Check version, force reload if old
2. Show loading state
3. Read cloud
4. Replace UI with cloud data
5. Fall back to localStorage only if offline

Push:
1. Read current cache (from last cloud sync)
2. Write with version check (optimistic concurrency)
3. If conflict: Re-read cloud, retry
4. Max 3 retries

Pull:
1. Read cloud
2. Overwrite localStorage
3. Update UI immediately (cloud is authoritative)
```

## Migration Steps

### Step 1: Apply SQL Migration

**Run this SQL in Supabase SQL Editor**:

```sql
-- Copy the entire contents of:
-- supabase/migrations/20261118000000_fix_sync_architecture.sql
```

**What it does**:
1. Creates `user_app_state` table with RLS
2. Creates `upsert_user_app_state()` RPC with optimistic concurrency
3. Migrates existing `__app_state__` paystubs row to owner's `user_app_state`
4. Adds `user_id` to paystubs
5. Backfills all paystubs rows to owner (9a6e4f26-68a8-445a-be81-db7d2f8ec414)
6. Replaces `anon_paystubs_all` policy with per-user RLS

**Verification queries**:

```sql
-- Check user_app_state row for owner
SELECT user_id, sync_version, updated_at,
       jsonb_array_length(plan->'affirmLoans') as loan_count
FROM user_app_state
WHERE user_id = '9a6e4f26-68a8-445a-be81-db7d2f8ec414';
-- Expected: 1 row, loan_count = 56, sync_version = 1

-- Check paystubs user_id backfill
SELECT COUNT(*), user_id FROM paystubs GROUP BY user_id;
-- Expected: 22 rows, all with owner's user_id

-- Check RLS policies
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('user_app_state', 'paystubs');
-- Expected: user_app_state_own_row, paystubs_own_rows
```

### Step 2: Deploy Client Code (DO NOT MERGE YET - User Review Required)

**Order**: Apply SQL first, then merge PR.

**Why**: The new client code will:
- Read from `user_app_state` table (needs to exist)
- Fall back to paystubs migration (one-time, handles transition)
- Use old localStorage as offline cache (graceful degradation)

If SQL is not applied yet, new client will:
- Get 404 from `user_app_state` table
- Read `__app_state__` from paystubs (still works)
- Write to `user_app_state` will fail silently (but paystubs still updated)
- Still functional, just not optimal

**Safe to deploy before SQL**: Yes, but not recommended (missing optimistic concurrency).

**Required order**: SQL first, then client code.

### Step 3: Verify Owner Can Still Access Data

After SQL migration, before deploying client:

1. **Owner logs in** to https://mybudget-phi.vercel.app
2. **Check /debt page**: Should show 56 loans (migrated from paystubs)
3. **Add a test loan**: Should save successfully
4. **Reload page**: Should show 57 loans (56 + 1)
5. **Delete test loan**: Should go back to 56

If any step fails, check:
```sql
SELECT * FROM user_app_state 
WHERE user_id = '9a6e4f26-68a8-445a-be81-db7d2f8ec414';
```

### Step 4: Deploy Client Code and Force Old Tabs to Reload

Once SQL is verified working:

1. **Merge PR** to main
2. **Vercel auto-deploys** (2-3 minutes)
3. **Old tabs auto-reload** on next interaction (APP_SYNC_VERSION check)
4. **New tabs** use cloud-authoritative sync immediately

## Testing Multi-Device Sync

After deployment, test with 3 devices:

### Test 1: Add Loan on Device A, Pull on Device B

1. Device A: Add loan "Test Multi-Device" with loan ID "TEST-001"
2. Device A: Save (should see 57 loans)
3. Device B: Reload or wait 30s
4. Device B: Should see 57 loans including "Test Multi-Device"

**Expected**: Device B adopts cloud state within 30s.

### Test 2: Delete Loan on Device A, Verify on Device B

1. Device A: Delete loan "Test Multi-Device"
2. Device A: Save (should see 56 loans)
3. Device B: Reload or wait 30s
4. Device B: Should see 56 loans, "Test Multi-Device" gone

**Expected**: Deletion syncs, loan stays deleted.

### Test 3: Edit Loan on Both Devices (Conflict)

1. Device A: Edit loan, change remaining to 400
2. Device A: Save (version 2)
3. Device B: Edit same loan, change remaining to 500
4. Device B: Save → should get version conflict
5. Device B: Auto-retries with fresh cloud read
6. Device B: Shows remaining = 400 (Device A's edit won)

**Expected**: Optimistic concurrency prevents stale overwrites.

### Test 4: Stale localStorage on Device C

1. Device C: Has ancient localStorage with 3 extra deleted loans
2. Device C: Loads page
3. Page load: Reads cloud (56 loans), overwrites localStorage
4. Device C: Shows 56 loans (cloud authoritative)
5. Device C: Old loans do NOT resurrect

**Expected**: Cloud overwrites stale localStorage on load.

## Rollback Plan

If migration causes issues:

### Rollback SQL

```sql
-- Revert to old schema (CAUTION: Loses per-user isolation)

-- Drop new table
DROP TABLE IF EXISTS public.user_app_state CASCADE;

-- Drop new RPC
DROP FUNCTION IF EXISTS public.upsert_user_app_state;

-- Remove user_id from paystubs
ALTER TABLE public.paystubs DROP COLUMN IF EXISTS user_id;

-- Restore global unique constraint
DROP INDEX IF EXISTS paystubs_user_pay_date_key;
ALTER TABLE public.paystubs 
  ADD CONSTRAINT paystubs_pay_date_key UNIQUE (pay_date);

-- Restore anon policy
DROP POLICY IF EXISTS "paystubs_own_rows" ON public.paystubs;
CREATE POLICY "anon_paystubs_all"
  ON public.paystubs
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
```

### Rollback Client

Revert the PR (git revert) or:

1. Change contexts to import from `./user-app-state` (old)
2. Remove imports from `./user-app-state-v2`
3. Remove `./app-version` imports
4. Redeploy

## Known Limitations

1. **Optimistic concurrency only at row level**: If two devices edit different loans simultaneously, last write still wins for the whole plan. Could be improved with per-item versioning.

2. **Manual conflict resolution**: If version conflict happens, cloud wins. User must re-apply their edit. Could show conflict UI in future.

3. **30s pull interval**: Changes from other devices take up to 30s to appear (or on focus/visibility). Could add Supabase Realtime for instant sync.

4. **localStorage still used as cache**: Could remove entirely and rely on in-memory cache only.

## Security Notes

**Before Migration**:
- ❌ `anon_paystubs_all` policy: `using (true)` allows anyone with anon key to read/write all paystubs
- ❌ No per-user isolation: All users share one global row
- ❌ Anon key exposed in client code

**After Migration**:
- ✅ Per-user RLS: `using (auth.uid() = user_id)`
- ✅ Authenticated users only: `revoke all from anon`
- ✅ Each user can only access their own data
- ✅ Optimistic concurrency prevents stale overwrites

**Recommendation**: Rotate anon key after migration to prevent abuse of old insecure policy.

## Performance Notes

- `user_app_state` table: 1 row per user, indexed by user_id (PK)
- `upsert_user_app_state()` RPC: Uses row-level locking (`FOR UPDATE`)
- Version conflict: Rare with per-user data (only if same user on multiple devices edits simultaneously)
- Pull interval: 30s (can be reduced if needed)

## Success Criteria

After migration, verify:

1. ✅ Owner can log in and see 56 loans
2. ✅ Owner can add/edit/delete loans
3. ✅ Changes persist across reloads
4. ✅ Two devices show same data after 30s
5. ✅ Old tabs auto-reload on interaction
6. ✅ Stale localStorage doesn't overwrite cloud
7. ✅ No console errors related to sync
8. ✅ `user_app_state` table has 1 row for owner
9. ✅ `paystubs` table has 22 rows, all with owner's user_id
10. ✅ RLS policies enforce per-user isolation

## Files Changed

**Database**:
- `supabase/migrations/20261118000000_fix_sync_architecture.sql` (new)

**Client**:
- `src/lib/app-version.ts` (new) - Version check to force old tabs to reload
- `src/lib/user-app-state-v2.ts` (new) - Cloud-authoritative sync with optimistic concurrency
- `src/lib/user-app-state-multidevice.test.ts` (new) - Multi-device sync tests

**Tests**:
- 6 new multi-device scenarios
- All existing tests still pass (13 debt-plan-merge, 7 spending-merge)

## Next Steps After Merge

1. Monitor Sentry for sync errors
2. Check Supabase logs for RLS policy violations
3. Verify all users can access their data
4. Monitor `user_app_state` table growth (1 row per user)
5. Consider adding Supabase Realtime for instant sync
6. Consider rotating anon key for security
