import { describe, expect, it } from 'vitest'
import { mergeSpendingStates } from './spending-merge'
import type { SpendingState } from './spending'

describe('mergeSpendingStates', () => {
  it('merges transactions by updatedAt timestamp', () => {
    const local: SpendingState = {
      transactions: [
        {
          id: 'txn1',
          date: '2026-11-01',
          description: 'Coffee',
          merchant: 'Starbucks',
          accountId: 'acc1',
          amount: 5.0,
          updatedAt: '2026-11-17T10:00:00Z',
        },
        {
          id: 'txn2',
          date: '2026-11-02',
          description: 'Lunch',
          merchant: 'Chipotle',
          accountId: 'acc1',
          amount: 12.0,
          updatedAt: '2026-11-17T11:00:00Z',
        },
      ],
      categories: [],
      rules: [],
      uploads: [],
    }

    const remote: SpendingState = {
      transactions: [
        {
          id: 'txn1',
          date: '2026-11-01',
          description: 'Coffee (edited)',
          merchant: 'Starbucks',
          accountId: 'acc1',
          amount: 5.5,
          updatedAt: '2026-11-17T12:00:00Z', // Newer
        },
        {
          id: 'txn3',
          date: '2026-11-03',
          description: 'Dinner',
          merchant: 'Restaurant',
          accountId: 'acc1',
          amount: 25.0,
          updatedAt: '2026-11-17T13:00:00Z',
        },
      ],
      categories: [],
      rules: [],
      uploads: [],
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.transactions).toHaveLength(3)
    expect(merged.transactions.find((t) => t.id === 'txn1')?.description).toBe(
      'Coffee (edited)',
    )
    expect(merged.transactions.find((t) => t.id === 'txn2')).toBeDefined()
    expect(merged.transactions.find((t) => t.id === 'txn3')).toBeDefined()
  })

  it('respects transaction tombstones', () => {
    const local: SpendingState = {
      transactions: [
        {
          id: 'txn1',
          date: '2026-11-01',
          description: 'Coffee',
          merchant: 'Starbucks',
          accountId: 'acc1',
          amount: 5.0,
        },
      ],
      categories: [],
      rules: [],
      uploads: [],
      removedTransactionIds: ['txn2'],
    }

    const remote: SpendingState = {
      transactions: [
        {
          id: 'txn2',
          date: '2026-11-02',
          description: 'Deleted item',
          merchant: 'Store',
          accountId: 'acc1',
          amount: 10.0,
        },
      ],
      categories: [],
      rules: [],
      uploads: [],
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.transactions).toHaveLength(1)
    expect(merged.transactions[0].id).toBe('txn1')
    expect(merged.removedTransactionIds).toContain('txn2')
  })

  it('merges categories with parent-child relationships', () => {
    const local: SpendingState = {
      transactions: [],
      categories: [
        {
          id: 'cat1',
          name: 'Spending a',
          grouped: true,
          updatedAt: '2026-11-17T10:00:00Z',
        },
        {
          id: 'cat2',
          name: 'Rollo gear',
          parentId: 'cat1',
          updatedAt: '2026-11-17T10:00:00Z',
        },
      ],
      rules: [],
      uploads: [],
    }

    const remote: SpendingState = {
      transactions: [],
      categories: [
        {
          id: 'cat1',
          name: 'Spending a',
          grouped: true,
          updatedAt: '2026-11-17T10:00:00Z',
        },
        {
          id: 'cat3',
          name: 'Clothing',
          parentId: 'cat1',
          updatedAt: '2026-11-17T11:00:00Z',
        },
      ],
      rules: [],
      uploads: [],
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.categories).toHaveLength(3)
    expect(merged.categories.find((c) => c.id === 'cat1')).toBeDefined()
    expect(merged.categories.find((c) => c.id === 'cat2')).toBeDefined()
    expect(merged.categories.find((c) => c.id === 'cat3')).toBeDefined()
  })

  it('handles category deletions via tombstones', () => {
    const local: SpendingState = {
      transactions: [],
      categories: [
        {
          id: 'cat1',
          name: 'Spending',
          grouped: true,
        },
      ],
      rules: [],
      uploads: [],
      removedCategoryIds: ['cat2', 'cat3'],
    }

    const remote: SpendingState = {
      transactions: [],
      categories: [
        {
          id: 'cat1',
          name: 'Spending',
          grouped: true,
        },
        {
          id: 'cat2',
          name: 'Deleted Category',
          parentId: 'cat1',
        },
        {
          id: 'cat3',
          name: 'Another Deleted',
          parentId: 'cat1',
        },
        {
          id: 'cat4',
          name: 'Keep This',
          parentId: 'cat1',
        },
      ],
      rules: [],
      uploads: [],
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.categories).toHaveLength(2)
    expect(merged.categories.find((c) => c.id === 'cat1')).toBeDefined()
    expect(merged.categories.find((c) => c.id === 'cat4')).toBeDefined()
    expect(merged.categories.find((c) => c.id === 'cat2')).toBeUndefined()
    expect(merged.categories.find((c) => c.id === 'cat3')).toBeUndefined()
  })

  it('prefers local on timestamp ties', () => {
    const timestamp = '2026-11-17T10:00:00Z'
    const local: SpendingState = {
      transactions: [
        {
          id: 'txn1',
          date: '2026-11-01',
          description: 'Local version',
          merchant: 'Store',
          accountId: 'acc1',
          amount: 5.0,
          updatedAt: timestamp,
        },
      ],
      categories: [],
      rules: [],
      uploads: [],
    }

    const remote: SpendingState = {
      transactions: [
        {
          id: 'txn1',
          date: '2026-11-01',
          description: 'Remote version',
          merchant: 'Store',
          accountId: 'acc1',
          amount: 6.0,
          updatedAt: timestamp,
        },
      ],
      categories: [],
      rules: [],
      uploads: [],
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.transactions[0].description).toBe('Local version')
  })

  it('merges tombstone arrays from both sides', () => {
    const local: SpendingState = {
      transactions: [],
      categories: [],
      rules: [],
      uploads: [],
      removedTransactionIds: ['t1', 't2'],
      removedCategoryIds: ['c1'],
    }

    const remote: SpendingState = {
      transactions: [],
      categories: [],
      rules: [],
      uploads: [],
      removedTransactionIds: ['t2', 't3'],
      removedCategoryIds: ['c2'],
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.removedTransactionIds).toEqual(
      expect.arrayContaining(['t1', 't2', 't3']),
    )
    expect(merged.removedCategoryIds).toEqual(expect.arrayContaining(['c1', 'c2']))
  })

  it('uses latest top-level updatedAt', () => {
    const local: SpendingState = {
      transactions: [],
      categories: [],
      rules: [],
      uploads: [],
      updatedAt: '2026-11-17T10:00:00Z',
    }

    const remote: SpendingState = {
      transactions: [],
      categories: [],
      rules: [],
      uploads: [],
      updatedAt: '2026-11-17T12:00:00Z',
    }

    const merged = mergeSpendingStates(local, remote)

    expect(merged.updatedAt).toBe('2026-11-17T12:00:00Z')
  })
})
