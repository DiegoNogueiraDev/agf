/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import * as utils from '../core/utils/index.js'

describe('utils barrel exports (index.ts)', () => {
  it('exports ac-helpers functions', () => {
    expect(typeof utils.getNodeAcTexts).toBe('function')
    expect(typeof utils.getNodeAcFromStore).toBe('function')
    expect(typeof utils.nodeHasAc).toBe('function')
  })

  it('exports epic-promotion functions', () => {
    expect(typeof utils.checkEpicPromotion).toBe('function')
    expect(typeof utils.autoPromoteEpic).toBe('function')
    expect(typeof utils.cascadeDownOnDone).toBe('function')
  })

  it('exports verified-auto-promote function', () => {
    expect(typeof utils.verifyAndPromote).toBe('function')
  })

  it('exports constants', () => {
    expect(utils.STORE_DIR).toBeDefined()
    expect(utils.DB_FILE).toBeDefined()
    expect(typeof utils.isLanguageSupported).toBe('function')
    expect(typeof utils.isLanguagePairSupported).toBe('function')
  })

  it('exports error classes', () => {
    expect(typeof utils.McpGraphError).toBe('function')
    expect(typeof utils.FileNotFoundError).toBe('function')
    expect(typeof utils.NodeNotFoundError).toBe('function')
    expect(typeof utils.ValidationError).toBe('function')
    expect(typeof utils.GraphNotInitializedError).toBe('function')
  })

  it('exports utility functions', () => {
    expect(typeof utils.fileExists).toBe('function')
    expect(typeof utils.safeReadFileSync).toBe('function')
    expect(typeof utils.generateId).toBe('function')
    expect(typeof utils.safeParseInt).toBe('function')
    expect(typeof utils.tokenize).toBe('function')
    expect(typeof utils.jaccardSimilarity).toBe('function')
    expect(typeof utils.normalizeNewlines).toBe('function')
    expect(typeof utils.now).toBe('function')
  })

  it('exports gradings', () => {
    expect(typeof utils.scoreToGrade).toBe('function')
  })

  it('exports platform utilities', () => {
    expect(typeof utils.IS_WINDOWS).toBe('boolean')
    expect(typeof utils.whichCommand).toBe('function')
    expect(typeof utils.killProcess).toBe('function')
  })

  it('exports node-type-sets constants', () => {
    expect(utils.TASK_TYPES instanceof Set).toBe(true)
    expect(utils.REQUIREMENT_TYPES instanceof Set).toBe(true)
    expect(utils.DESIGN_TYPES instanceof Set).toBe(true)
  })
})
