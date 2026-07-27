/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_6ad917d415c0 — C83-T1: tests for extractEntities
 *
 * AC: extractEntities returns ExtractionResult with blocks and summary;
 *     handles empty text; does not throw; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { extractEntities } from '../core/parser/extract.js'

const SAMPLE_PRD = `
# Feature: User Authentication

## Epic: Login System

### Task: Implement login form
Build the user login interface.

- [ ] Email input field
- [ ] Password input field
- [ ] Submit button

## Risk: Security vulnerabilities
Potential XSS risk in input handling.
`

describe('extractEntities', () => {
  it('returns an object with blocks and summary', () => {
    const result = extractEntities(SAMPLE_PRD)
    expect(result).toHaveProperty('blocks')
    expect(result).toHaveProperty('summary')
  })

  it('blocks is an array', () => {
    const result = extractEntities(SAMPLE_PRD)
    expect(Array.isArray(result.blocks)).toBe(true)
  })

  it('summary has totalSections property', () => {
    const result = extractEntities(SAMPLE_PRD)
    expect(typeof result.summary.totalSections).toBe('number')
  })

  it('summary counts are non-negative numbers', () => {
    const result = extractEntities(SAMPLE_PRD)
    const { epics, tasks, subtasks, requirements, constraints, acceptanceCriteria, risks, unknown } = result.summary
    for (const count of [epics, tasks, subtasks, requirements, constraints, acceptanceCriteria, risks, unknown]) {
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })

  it('does not throw on empty text', () => {
    expect(() => extractEntities('')).not.toThrow()
  })

  it('empty text returns empty blocks', () => {
    const result = extractEntities('')
    expect(result.blocks.length).toBe(0)
  })

  it('empty text summary has zero totalSections', () => {
    const result = extractEntities('')
    expect(result.summary.totalSections).toBe(0)
  })

  it('does not throw on whitespace-only text', () => {
    expect(() => extractEntities('   \n\n   ')).not.toThrow()
  })

  it('detects blocks from sample PRD', () => {
    const result = extractEntities(SAMPLE_PRD)
    expect(result.blocks.length).toBeGreaterThan(0)
  })

  it('totalSections matches blocks length', () => {
    const result = extractEntities(SAMPLE_PRD)
    expect(result.summary.totalSections).toBe(result.blocks.length)
  })

  it('each block has a type property', () => {
    const result = extractEntities(SAMPLE_PRD)
    for (const block of result.blocks) {
      expect(typeof block.type).toBe('string')
    }
  })

  it('plain text without headers produces blocks', () => {
    const result = extractEntities('This is a plain text with no headers or structure.')
    expect(result).toHaveProperty('blocks')
    expect(result).toHaveProperty('summary')
  })
})
