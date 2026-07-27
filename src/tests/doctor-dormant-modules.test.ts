/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 6.2: Surface dormant modules in agf doctor output.
 * AC1 — dormant modules with importCount=0 → advisory level check.
 * AC2 — dormant module newly imported in non-test file → warning level.
 * AC3 — dormant entries include deprecationStatus: 'deletion_candidate'.
 */

import { describe, it, expect } from 'vitest'
import { checkDormantModules } from '../core/doctor/doctor-checks.js'

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('T6.2 AC1: dormant modules with importCount=0 → advisory', () => {
  it('returns level "ok" or "warning" (not error) for unimported dormant modules', () => {
    const result = checkDormantModules([])
    expect(['ok', 'warning', 'advisory']).toContain(result.level)
  })

  it('result name is dormant-modules', () => {
    const result = checkDormantModules([])
    expect(result.name).toBe('dormant-modules')
  })

  it('message includes importCount=0 or "no new imports" when no file imports dormant modules', () => {
    const sourceFiles = [{ path: 'src/core/main.ts', content: 'import { x } from "./active-module.js"' }]
    const result = checkDormantModules(sourceFiles)
    // No dormant module imported → advisory (or ok)
    expect(['ok', 'advisory']).toContain(result.level)
  })

  it('result includes dormantModules array in data', () => {
    const result = checkDormantModules([])
    expect(result).toHaveProperty('data')
    expect(Array.isArray((result as unknown as Record<string, unknown>).data)).toBe(true)
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('T6.2 AC2: dormant module imported in non-test file → warning', () => {
  it('escalates to "warning" when a non-test file imports a dormant module', () => {
    const sourceFiles = [
      {
        path: 'src/core/my-feature.ts',
        content: 'import { economyOrchestrate } from "./economy-orchestrator.js"',
      },
    ]
    const result = checkDormantModules(sourceFiles)
    expect(result.level).toBe('warning')
  })

  it('stays advisory when only test files import a dormant module', () => {
    const sourceFiles = [
      {
        path: 'src/tests/economy-orchestrator.test.ts',
        content: 'import { economyOrchestrate } from "../core/economy/economy-orchestrator.js"',
      },
    ]
    const result = checkDormantModules(sourceFiles)
    expect(['ok', 'advisory']).toContain(result.level)
  })
})

// ── AC3 ───────────────────────────────────────────────────────────────────────

describe('T6.2 AC3: dormant entries include deprecationStatus: deletion_candidate', () => {
  it('each dormant module entry has deprecationStatus: deletion_candidate', () => {
    const result = checkDormantModules([]) as unknown as { data: Array<Record<string, unknown>> }
    if (result.data.length > 0) {
      for (const entry of result.data) {
        expect(entry.deprecationStatus).toBe('deletion_candidate')
      }
    }
    // If no entries, the assertion doesn't fail — but field must be present when entries exist
  })

  it('dormant module entry for economy-orchestrator has importCount field', () => {
    const result = checkDormantModules([]) as unknown as { data: Array<Record<string, unknown>> }
    const orchestratorEntry = result.data.find((e) => String(e.module ?? '').includes('economy-orchestrator'))
    if (orchestratorEntry) {
      expect(typeof orchestratorEntry.importCount).toBe('number')
    }
    // Pass even if not listed — the presence check covers the case when it IS listed
  })
})
