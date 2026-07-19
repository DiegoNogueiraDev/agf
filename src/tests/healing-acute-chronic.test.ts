/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 5.2 AC coverage: distinguish acute vs chronic healing issues
 *
 * AC1: broken_dependency → 'acute' (auto-reparável, deterministic fix)
 * AC2: cycle_detected → 'chronic' (requires design decision, human review)
 * AC3: classifyIssue partitions all issue types exhaustively
 */

import { describe, it, expect } from 'vitest'
import { classifyIssue, type HealingIssueCategory } from '../core/skills/persist-healing.js'
import type { HealingIssueType } from '../schemas/healing.schema.js'

// ── AC1: acute issues have deterministic fixes ────────────────────────────────

describe('AC1: broken_dependency is acute (auto-reparável, deterministic fix)', () => {
  it('broken_dependency → acute', () => {
    expect(classifyIssue('broken_dependency')).toBe('acute')
  })

  it('stuck_task → acute', () => {
    expect(classifyIssue('stuck_task')).toBe('acute')
  })

  it('orphan_node → acute', () => {
    expect(classifyIssue('orphan_node')).toBe('acute')
  })

  it('blocked_no_blocker → acute', () => {
    expect(classifyIssue('blocked_no_blocker')).toBe('acute')
  })

  it('stale_in_progress → acute', () => {
    expect(classifyIssue('stale_in_progress')).toBe('acute')
  })
})

// ── AC2: chronic issues require design decisions ──────────────────────────────

describe('AC2: cycle_detected is chronic (requires design decision)', () => {
  it('cycle_detected → chronic', () => {
    expect(classifyIssue('cycle_detected')).toBe('chronic')
  })

  it('oversized_undecomposed → chronic', () => {
    expect(classifyIssue('oversized_undecomposed')).toBe('chronic')
  })

  it('missing_ac → chronic', () => {
    expect(classifyIssue('missing_ac')).toBe('chronic')
  })

  it('done_with_pending_deps → chronic', () => {
    expect(classifyIssue('done_with_pending_deps')).toBe('chronic')
  })
})

// ── AC3: all issue types are classified, acute + chronic are mutually exclusive ─

describe('AC3: categorized result — acute and chronic are exhaustive and exclusive', () => {
  it('all known HealingIssueTypes are classified', () => {
    const allTypes: HealingIssueType[] = [
      'stuck_task',
      'broken_dependency',
      'orphan_node',
      'stale_in_progress',
      'cycle_detected',
      'missing_ac',
      'oversized_undecomposed',
      'blocked_no_blocker',
      'done_with_pending_deps',
    ]
    for (const t of allTypes) {
      const cat = classifyIssue(t)
      expect(['acute', 'chronic']).toContain(cat)
    }
  })

  it('acute and chronic partitions are mutually exclusive', () => {
    const allTypes: HealingIssueType[] = [
      'stuck_task',
      'broken_dependency',
      'orphan_node',
      'stale_in_progress',
      'cycle_detected',
      'missing_ac',
      'oversized_undecomposed',
      'blocked_no_blocker',
      'done_with_pending_deps',
    ]
    const acute = allTypes.filter((t) => classifyIssue(t) === 'acute')
    const chronic = allTypes.filter((t) => classifyIssue(t) === 'chronic')
    expect(acute.length + chronic.length).toBe(allTypes.length)
    const overlap = acute.filter((t) => chronic.includes(t))
    expect(overlap).toHaveLength(0)
  })

  it('HealingIssueCategory is acute or chronic', () => {
    const cat: HealingIssueCategory = 'chronic'
    expect(['acute', 'chronic']).toContain(cat)
  })
})
