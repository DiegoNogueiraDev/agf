/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { IssuePatternTracker, classifySignals, type ClassifierSignal } from '../core/harness/issue-pattern-tracker.js'

describe('IssuePatternTracker', () => {
  let db: Database.Database
  let tracker: IssuePatternTracker

  beforeEach(() => {
    db = new Database(':memory:')
    tracker = new IssuePatternTracker(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('recordIssue', () => {
    it('should record a new pattern', () => {
      tracker.recordIssue('missing_ac', 'node_1')
      const pattern = tracker.getPattern('missing_ac')
      expect(pattern).not.toBeNull()
      expect(pattern!.patternType).toBe('missing_ac')
      expect(pattern!.count).toBe(1)
    })

    it('should increment count for existing pattern', () => {
      tracker.recordIssue('missing_ac', 'node_1')
      tracker.recordIssue('missing_ac', 'node_2')
      const pattern = tracker.getPattern('missing_ac')
      expect(pattern!.count).toBe(2)
    })

    it('should set suggested_rule when threshold is reached', () => {
      tracker.recordIssue('missing_ac', 'n1')
      tracker.recordIssue('missing_ac', 'n2')
      tracker.recordIssue('missing_ac', 'n3')
      const pattern = tracker.getPattern('missing_ac')
      expect(pattern!.suggestedRule).toBeTruthy()
      expect(pattern!.suggestedRule).toContain('Acceptance Criteria Required')
    })
  })

  describe('getPattern', () => {
    it('should return null for unknown pattern', () => {
      expect(tracker.getPattern('nonexistent')).toBeNull()
    })
  })

  describe('getAllPatterns', () => {
    it('should return empty array initially', () => {
      expect(tracker.getAllPatterns()).toEqual([])
    })

    it('should return patterns sorted by count descending', () => {
      tracker.recordIssue('pattern_a', 'n1')
      tracker.recordIssue('pattern_b', 'n1')
      tracker.recordIssue('pattern_b', 'n2')

      const patterns = tracker.getAllPatterns()
      expect(patterns).toHaveLength(2)
      expect(patterns[0].patternType).toBe('pattern_b')
      expect(patterns[1].patternType).toBe('pattern_a')
    })
  })

  describe('getSuggestedRules', () => {
    it('should return empty array when no patterns cross threshold', () => {
      tracker.recordIssue('missing_ac', 'n1')
      expect(tracker.getSuggestedRules()).toEqual([])
    })

    it('should return patterns at or above threshold with suggestion', () => {
      tracker.recordIssue('status_skip', 'n1')
      tracker.recordIssue('status_skip', 'n2')
      tracker.recordIssue('status_skip', 'n3')

      const rules = tracker.getSuggestedRules()
      expect(rules).toHaveLength(1)
      expect(rules[0].patternType).toBe('status_skip')
      expect(rules[0].suggestedRule).toContain('Enforce Status Flow')
    })
  })

  describe('getStats', () => {
    it('should return zeros initially', () => {
      const stats = tracker.getStats()
      expect(stats.total).toBe(0)
      expect(stats.recurring).toBe(0)
    })

    it('should count total and recurring patterns', () => {
      tracker.recordIssue('missing_ac', 'n1')
      tracker.recordIssue('orphan_node', 'n1')
      tracker.recordIssue('orphan_node', 'n2')
      tracker.recordIssue('orphan_node', 'n3')

      const stats = tracker.getStats()
      expect(stats.total).toBe(2)
      expect(stats.recurring).toBe(1)
    })
  })
})

describe('classifySignals', () => {
  it('should return empty array for no signals', () => {
    expect(classifySignals([])).toEqual([])
  })

  it('should detect gate blocking patterns', () => {
    const signals: ClassifierSignal[] = Array.from({ length: 5 }, (_, i) => ({
      source: 'lifecycle_gate',
      signalKind: 'gate_blocked',
      context: { toolName: 'start_task' },
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
    }))

    const result = classifySignals(signals)
    expect(result.some((r) => r.patternType === 'gate_blocking_too_often')).toBe(true)
  })

  it('should detect tool failing patterns', () => {
    const signals: ClassifierSignal[] = Array.from({ length: 3 }, (_, i) => ({
      source: 'tool_invocation',
      signalKind: 'tool_isError',
      context: { toolName: 'evaluate' },
      timestamp: new Date().toISOString(),
      rawError: 'fail',
    }))

    const result = classifySignals(signals)
    expect(result.some((r) => r.patternType === 'tool_failing_for_input_kind')).toBe(true)
  })

  it('should detect SQLite lock storms', () => {
    const now = Date.now()
    const signals: ClassifierSignal[] = Array.from({ length: 3 }, (_, i) => ({
      source: 'sqlite',
      signalKind: 'SQLITE_BUSY',
      context: {},
      timestamp: new Date(now + i * 1000).toISOString(),
    }))

    const result = classifySignals(signals)
    expect(result.some((r) => r.patternType === 'sqlite_lock_storm')).toBe(true)
  })

  it('should detect flaky MCP adapters', () => {
    const signals: ClassifierSignal[] = Array.from({ length: 3 }, (_, i) => ({
      source: 'mcp_server',
      signalKind: 'uncaught_exception',
      context: { adapterName: 'github' },
      timestamp: new Date().toISOString(),
    }))

    const result = classifySignals(signals)
    expect(result.some((r) => r.patternType === 'mcp_adapter_flaky')).toBe(true)
  })

  it('should detect chronic DoD check failures', () => {
    const signals: ClassifierSignal[] = [
      {
        source: 'dod_check',
        signalKind: 'dod_fail',
        context: { nodeId: 'n1' },
        timestamp: new Date().toISOString(),
        rawError: 'has_description, has_acceptance_criteria',
      },
      {
        source: 'dod_check',
        signalKind: 'dod_fail',
        context: { nodeId: 'n2' },
        timestamp: new Date().toISOString(),
        rawError: 'has_description, has_acceptance_criteria',
      },
      {
        source: 'dod_check',
        signalKind: 'dod_fail',
        context: { nodeId: 'n3' },
        timestamp: new Date().toISOString(),
        rawError: 'has_description, has_acceptance_criteria',
      },
    ]

    const result = classifySignals(signals)
    expect(result.some((r) => r.patternType === 'dod_check_has_description_chronic')).toBe(true)
    expect(result.some((r) => r.patternType === 'dod_check_has_acceptance_criteria_chronic')).toBe(true)
  })

  it('should not detect if signals are below threshold', () => {
    const signals: ClassifierSignal[] = [
      {
        source: 'tool_invocation',
        signalKind: 'tool_isError',
        context: { toolName: 'evaluate' },
        timestamp: new Date().toISOString(),
        rawError: 'fail',
      },
    ]

    const result = classifySignals(signals)
    expect(result.some((r) => r.patternType === 'tool_failing_for_input_kind')).toBe(false)
  })

  it('should return empty array for irrelevant signal kinds', () => {
    const signals: ClassifierSignal[] = [
      { source: 'lifecycle_gate', signalKind: 'gate_passed', context: {}, timestamp: new Date().toISOString() },
    ]

    expect(classifySignals(signals)).toEqual([])
  })
})
