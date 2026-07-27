/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Sleep-consolidation over the project memory store (`consolidation` lever).
 * Exercised on a real temp-dir memory store — merge near-duplicates, drop the
 * redundant re-statements, report the token saving; non-destructive unless apply.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeMemory, listMemories } from '../core/memory/memory-reader.js'
import { consolidateProjectMemories } from '../core/memory/consolidate-memories.js'

describe('consolidateProjectMemories', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-consolidate-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports zero work on an empty memory store', async () => {
    const result = await consolidateProjectMemories(dir)
    expect(result.total).toBe(0)
    expect(result.removed).toEqual([])
    expect(result.savedTokens).toBe(0)
  })

  it('dry-run reports near-duplicate removals without deleting', async () => {
    const body = 'The auth service validates JWT tokens and refreshes them on every protected request here.'
    await writeMemory(dir, 'auth-a', body)
    await writeMemory(dir, 'auth-b', body + ' ') // near-duplicate
    await writeMemory(dir, 'billing', 'Billing reconciles invoices against the ledger nightly across all tenants.')

    const result = await consolidateProjectMemories(dir, { apply: false })
    expect(result.total).toBe(3)
    expect(result.merged).toBeGreaterThanOrEqual(1)
    expect(result.removed.length).toBeGreaterThanOrEqual(1)
    expect(result.savedTokens).toBeGreaterThan(0)
    expect(result.applied).toBe(false)

    // Dry-run must not touch the store.
    expect((await listMemories(dir)).length).toBe(3)
  })

  it('apply deletes the redundant memories and keeps the distinct ones', async () => {
    const body = 'The auth service validates JWT tokens and refreshes them on every protected request here.'
    await writeMemory(dir, 'auth-a', body)
    await writeMemory(dir, 'auth-b', body + ' ')
    await writeMemory(dir, 'billing', 'Billing reconciles invoices against the ledger nightly across all tenants.')

    const result = await consolidateProjectMemories(dir, { apply: true })
    expect(result.applied).toBe(true)
    expect(result.removed.length).toBeGreaterThanOrEqual(1)

    const remaining = await listMemories(dir)
    expect(remaining.length).toBe(3 - result.removed.length)
    expect(remaining).toContain('billing') // distinct memory survives
  })
})
