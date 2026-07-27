/*!
 * Tests for tdd-checker.ts — generateTddHintsFromTexts pure function.
 *
 * generateTddHintsFromTexts(acTexts[]) is pure: takes AC strings and
 * returns TddHint[] based on GWT parsing and keyword inference.
 * No DB or LLM dependency.
 *
 * Covers: empty input, GWT format, plain testable AC, inferTestType keywords.
 */

import { describe, it, expect } from 'vitest'
import { generateTddHintsFromTexts } from '../core/implementer/tdd-checker.js'

// ── empty input ──────────────────────────────────────────────────────────────

describe('generateTddHintsFromTexts — empty input', () => {
  it('returns empty array for empty AC list', () => {
    expect(generateTddHintsFromTexts([])).toEqual([])
  })
})

// ── unit test type inference via keywords ────────────────────────────────────

describe('generateTddHintsFromTexts — unit keyword inference', () => {
  it('infers unit type for AC containing "returns"', () => {
    const hints = generateTddHintsFromTexts(['function returns the sum of two values'])
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0].type).toBe('unit')
  })

  it('infers unit type for AC with no integration/e2e keywords (defaults to unit)', () => {
    // "validates" is a unit keyword — no integration/e2e keywords present
    const hints = generateTddHintsFromTexts(['component should validate the total price'])
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0].type).toBe('unit')
  })

  it('infers unit type for AC containing "validates" (no e2e/integration keyword)', () => {
    const hints = generateTddHintsFromTexts(['service validates the input token'])
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0].type).toBe('unit')
  })
})

// ── integration test type inference ─────────────────────────────────────────

describe('generateTddHintsFromTexts — integration keyword inference', () => {
  it('infers integration type for AC containing "saves"', () => {
    const hints = generateTddHintsFromTexts(['system saves user record to database'])
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0].type).toBe('integration')
  })

  it('infers integration type for AC containing "persist"', () => {
    const hints = generateTddHintsFromTexts(['the service should persist data to db'])
    expect(hints[0].type).toBe('integration')
  })

  it('infers integration type for AC containing "sends"', () => {
    const hints = generateTddHintsFromTexts(['the notifier sends an email to the user'])
    expect(hints[0].type).toBe('integration')
  })
})

// ── e2e test type inference ──────────────────────────────────────────────────

describe('generateTddHintsFromTexts — e2e keyword inference', () => {
  it('infers e2e type for AC containing "navigate"', () => {
    const hints = generateTddHintsFromTexts(['user should navigate to the dashboard page'])
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0].type).toBe('e2e')
  })

  it('infers e2e type for AC containing "displays"', () => {
    const hints = generateTddHintsFromTexts(['page displays the list of users'])
    expect(hints[0].type).toBe('e2e')
  })

  it('infers e2e type for AC containing "form"', () => {
    const hints = generateTddHintsFromTexts(['the form should submit on button click'])
    expect(hints[0].type).toBe('e2e')
  })
})

// ── multiple ACs generate multiple hints ─────────────────────────────────────

describe('generateTddHintsFromTexts — multiple ACs', () => {
  it('generates hints from multiple testable ACs', () => {
    const acs = [
      'function returns a sorted list',
      'system saves records to database',
      'page displays the results to the user',
    ]
    const hints = generateTddHintsFromTexts(acs)
    // Each testable AC produces ≥1 hint
    expect(hints.length).toBeGreaterThanOrEqual(acs.length)
  })

  it('each hint references its source AC in fromAc field', () => {
    const ac = 'component returns the formatted date'
    const hints = generateTddHintsFromTexts([ac])
    for (const hint of hints) {
      expect(hint.fromAc).toBe(ac)
    }
  })

  it('each hint has a non-empty testName', () => {
    const hints = generateTddHintsFromTexts(['service validates input schema'])
    for (const hint of hints) {
      expect(hint.testName.length).toBeGreaterThan(0)
    }
  })
})

// ── GWT format AC ────────────────────────────────────────────────────────────

describe('generateTddHintsFromTexts — GWT format', () => {
  it('generates a hint from a multi-line GWT AC', () => {
    const gwt = 'Given a valid token\nWhen the API is called\nThen it returns the result'
    const hints = generateTddHintsFromTexts([gwt])
    expect(hints.length).toBeGreaterThan(0)
  })

  it('GWT hint testName contains the Then clause text', () => {
    const gwt = 'Given a valid user\nWhen login is submitted\nThen returns authentication token'
    const hints = generateTddHintsFromTexts([gwt])
    expect(hints.length).toBeGreaterThan(0)
    expect(hints[0].testName.toLowerCase()).toContain('returns authentication token')
  })
})
