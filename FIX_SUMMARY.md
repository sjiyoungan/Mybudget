# Category Dropdown Fix - Summary

## Problem

On the Spending page at https://mybudget-phi.vercel.app/spending, the add-transaction and edit-transaction form's Category dropdown only showed top-level category groups (Uncategorized, Spending, Groceries, Gas, etc.). 

**Missing**: All subcategories under parent groups were not visible, such as:
- Under "Spending": Rollo's gear, Clothing, Kitchenware, Health and fitness, Toiletries, etc.
- Under "Groceries": Any subcategories
- Under "Gas": Any subcategories
- Under custom groups: Any subcategories

**Impact**:
- ❌ New transactions couldn't be assigned a subcategory
- ❌ Editing an existing transaction would wipe its subcategory when saved
- ❌ Only parent category groups were selectable

## Root Cause

The `calendarCategoryOptions` function in `src/pages/spending-page.tsx` (line 1226) was hardcoded to only show subcategories for the "Spending" parent category.

### Before (Broken Code)

```typescript
function calendarCategoryOptions(categories: SpendingCategory[]) {
  // ... setup code ...
  
  // ❌ PROBLEM: Only builds children array for "Spending" category
  const children = (
    spending
      ? categories.filter(
          (item) =>
            item.parentId === spending.id && isActiveSpendingCategory(item),
        )
      : []
  ).sort((left, right) => left.name.localeCompare(right.name))
  
  const rows: { id: string; label: string; depth: number }[] = []
  for (const main of ordered) {
    rows.push({ id: main.id, label: categoryLabel(main.name), depth: 0 })
    
    // ❌ PROBLEM: Only adds children for "Spending", skips all other groups
    if (main.id !== spending?.id) continue
    
    for (const child of children) {
      rows.push({ id: child.id, label: toSentenceCase(child.name), depth: 1 })
    }
  }
  return rows
}
```

**Why it broke**: 
- Line 1242-1249: Children array was only built for the `spending` category
- Line 1253: `if (main.id !== spending?.id) continue` prevented other groups from showing their children

This logic was introduced in commit `1111047` on Sep 4, 2026: "Let spending groups allot an expense budget and nest categories underneath." The commit added nested category support but inadvertently restricted subcategory display to only the Spending group.

## Solution

Moved the children lookup **inside the main category iteration loop** so that every parent category can display its own subcategories.

### After (Fixed Code)

```typescript
function calendarCategoryOptions(categories: SpendingCategory[]) {
  // ... setup code ...
  
  const rows: { id: string; label: string; depth: number }[] = []
  for (const main of ordered) {
    rows.push({ id: main.id, label: categoryLabel(main.name), depth: 0 })
    
    // ✅ FIX: Build children array for EACH parent category
    const children = categories
      .filter(
        (item) =>
          item.parentId === main.id && isActiveSpendingCategory(item),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
    
    // ✅ FIX: Add all children for current parent
    for (const child of children) {
      rows.push({ id: child.id, label: toSentenceCase(child.name), depth: 1 })
    }
  }
  return rows
}
```

**Key changes**:
1. Removed the hardcoded `children` array that only looked at `spending.id`
2. Removed the `if (main.id !== spending?.id) continue` check
3. Added children lookup inside the loop, filtering by `item.parentId === main.id`
4. Now every parent category gets its subcategories listed

## Changes Made

### Files Modified
- `src/pages/spending-page.tsx` (lines 1226-1259)

### Function Modified
- `calendarCategoryOptions()` - Now iterates through all parent categories and includes their children

### Components Affected
Both forms use the same `CategoryPairFields` component, so both are fixed:
- ✅ `AddTxnDialog` - Add new transaction form
- ✅ `EditTxnDialog` - Edit existing transaction form

## Verification

### Build Status
✅ **Build passes**: `npm run build` completes successfully  
✅ **Linter passes**: `npm run lint` reports no issues  
✅ **CI workflow**: GitHub Actions workflow runs on PR (build + lint)

### Expected Behavior After Fix
✅ Category dropdown shows ALL subcategories grouped under their parent  
✅ Subcategories are properly indented (depth: 1) under parent groups  
✅ Edit form pre-selects the transaction's current subcategory  
✅ Saving an edit without changing category preserves the subcategory  
✅ New transactions can be assigned to any subcategory  

## Deployment

- **Repository**: https://github.com/sjiyoungan/Mybudget
- **Production URL**: https://mybudget-phi.vercel.app
- **Deployment**: Automatic via Vercel when merged to `main`
- **PR**: https://github.com/sjiyoungan/Mybudget/pull/1

**Merging this PR will automatically deploy to production.**

## Additional Notes: Category Merging/Moving

The user mentioned wanting to merge duplicate groups (e.g., "Spending a" and "Spending b"). 

**Current capabilities**:
- ✅ Users can add/remove subcategories within a group
- ✅ Users can add/remove groups
- ✅ Subcategories get `parentId` set to their current group on save

**To merge groups manually**:
1. Open "Edit categories" dialog
2. Copy subcategory names from source group
3. Add them to the target group (click "Add subcategory")
4. Delete the source group

**Future enhancement** (not implemented):
A drag-and-drop interface to move subcategories between groups would be more user-friendly. The data model already supports this (subcategories just need their `parentId` changed), but the UI doesn't have drag-and-drop implemented yet.

## Git History Reference

Commits related to this feature:
```
1111047 - Sep 4, 2026 - Let spending groups allot an expense budget and nest categories underneath.
  ↑ This commit introduced nested categories but inadvertently restricted subcategory display
  
50e2d23 - Show multi-expense allotment totals and quiet Edit categories fields until hover.
fde2a7f - Show category spend against budget on the right, and mark overages beside the name.
4275ec1 - Soften category budgets and indent nested categories another 8px.
38584db - Left-align group names in the transaction category menu.
```

The fix restores the intended behavior: all subcategories under any parent group should be visible in the dropdown.
