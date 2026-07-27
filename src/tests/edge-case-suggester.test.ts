/*!
 * Task node_9e4d4f334592 — deterministic edge-case AC suggester.
 *
 * AC1: Given I/O file task, When suggested, Then includes 'error path' and 'empty input' stubs
 * AC2: Given pure calculation task, When suggested, Then includes boundary stub
 * AC3: Given container node (epic/requirement), When suggested, Then returns empty list
 */

import { describe, it, expect } from 'vitest'
import { suggestEdgeCaseAcs, type EdgeCaseSuggestion } from '../core/analyzer/edge-case-suggester.js'

describe('suggestEdgeCaseAcs', () => {
  it('I/O file task includes error path and empty input stubs (AC1)', () => {
    const suggestions: EdgeCaseSuggestion[] = suggestEdgeCaseAcs({
      title: 'Read config file and parse JSON',
      description: 'Reads a YAML file from disk and parses it',
      type: 'task',
    })
    const labels = suggestions.map((s) => s.category)
    expect(labels).toContain('error_path')
    expect(labels).toContain('empty_input')
  })

  it('pure calculation task includes boundary stub (AC2)', () => {
    const suggestions = suggestEdgeCaseAcs({
      title: 'Calculate token budget from model limits',
      description: 'Computes the max tokens based on model tier',
      type: 'task',
    })
    const labels = suggestions.map((s) => s.category)
    expect(labels).toContain('boundary')
  })

  it('container node (epic) returns empty list (AC3)', () => {
    const suggestions = suggestEdgeCaseAcs({
      title: 'Economy epic',
      description: 'Epic for cost control features',
      type: 'epic',
    })
    expect(suggestions).toHaveLength(0)
  })

  it('each suggestion has category, acText, and rationale fields', () => {
    const suggestions = suggestEdgeCaseAcs({
      title: 'Sort and filter results',
      description: 'Sorts array and filters by predicate',
      type: 'task',
    })
    for (const s of suggestions) {
      expect(typeof s.category).toBe('string')
      expect(typeof s.acText).toBe('string')
      expect(typeof s.rationale).toBe('string')
    }
  })
})
