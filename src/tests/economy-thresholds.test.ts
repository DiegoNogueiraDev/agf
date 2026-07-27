/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 6.1: Document phase-dependent thresholds in CLI output and reference docs.
 * AC1 — economy list output includes thresholds object per lever.
 * AC2 — LEVER_DEFAULTS exports numeric default thresholds for each lever.
 * AC3 — thresholds in output are derived from LEVER_DEFAULTS (not static copy).
 */

import { describe, it, expect } from 'vitest'
import { LEVER_KEYS, LEVER_DEFAULTS, buildLeverListEntry } from '../core/economy/economy-levers-config.js'

// ── AC1 + AC3 ─────────────────────────────────────────────────────────────────

describe('T6.1 AC1: economy list output includes thresholds per lever', () => {
  it('buildLeverListEntry returns an entry with a thresholds object', () => {
    const entry = buildLeverListEntry('forage_stop', false, 0, {})
    expect(entry).toHaveProperty('thresholds')
    expect(typeof entry.thresholds).toBe('object')
    expect(entry.thresholds).not.toBeNull()
  })

  it('forage_stop thresholds includes minItems and epsilon defaults', () => {
    const entry = buildLeverListEntry('forage_stop', false, 0, {})
    expect(entry.thresholds).toHaveProperty('minItems')
    expect(entry.thresholds).toHaveProperty('epsilon')
  })

  it('mdl_select thresholds includes codeAstMin default', () => {
    const entry = buildLeverListEntry('mdl_select', false, 0, {})
    expect(entry.thresholds).toHaveProperty('codeAstMin')
    expect(typeof entry.thresholds.codeAstMin).toBe('number')
  })

  it('all LEVER_KEYS produce entries with thresholds', () => {
    for (const key of LEVER_KEYS) {
      const entry = buildLeverListEntry(key, false, 0, {})
      expect(entry.thresholds).toBeDefined()
    }
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('T6.1 AC2: LEVER_DEFAULTS exports numeric thresholds for all levers', () => {
  it('LEVER_DEFAULTS is an object', () => {
    expect(typeof LEVER_DEFAULTS).toBe('object')
    expect(LEVER_DEFAULTS).not.toBeNull()
  })

  it('LEVER_DEFAULTS has entries for at least 5 levers', () => {
    const keys = Object.keys(LEVER_DEFAULTS)
    expect(keys.length).toBeGreaterThanOrEqual(5)
  })

  it('forage_stop defaults have minItems as a number', () => {
    expect(typeof LEVER_DEFAULTS.forage_stop.minItems).toBe('number')
  })

  it('mdl_select defaults have codeAstMin = 512', () => {
    expect(LEVER_DEFAULTS.mdl_select.codeAstMin).toBe(512)
  })

  it('ncd_dedup defaults have threshold as a number', () => {
    expect(typeof LEVER_DEFAULTS.ncd_dedup.threshold).toBe('number')
  })
})

// ── AC3 (anti-static-copy) ────────────────────────────────────────────────────

describe('T6.1 AC3: thresholds are derived from LEVER_DEFAULTS, not static strings', () => {
  it('buildLeverListEntry for mdl_select reflects LEVER_DEFAULTS.mdl_select.codeAstMin', () => {
    const entry = buildLeverListEntry('mdl_select', false, 0, {})
    expect(entry.thresholds.codeAstMin).toBe(LEVER_DEFAULTS.mdl_select.codeAstMin)
  })

  it('buildLeverListEntry for forage_stop reflects LEVER_DEFAULTS.forage_stop.minItems', () => {
    const entry = buildLeverListEntry('forage_stop', false, 0, {})
    expect(entry.thresholds.minItems).toBe(LEVER_DEFAULTS.forage_stop.minItems)
  })
})
