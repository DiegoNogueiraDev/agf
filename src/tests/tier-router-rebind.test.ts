/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 2.1 — Rebind Tier Defaults para Haiku 4.5 / Sonnet 4.6 / Opus 4.8
 *
 * AC:
 * 1. agf model route cheap → claude-haiku-4-5
 * 2. agf model route build → claude-sonnet-4-6
 * 3. agf model route frontier → claude-opus-4-8
 * 4. agf doctor --providers confirma tiers sem erro (resolveTierModel não lança)
 */
import { describe, it, expect } from 'vitest'
import {
  resolveTierModel,
  MODEL_POOL,
  ANTHROPIC_CHEAP_DEFAULT,
  ANTHROPIC_BUILD_DEFAULT,
  ANTHROPIC_FRONTIER_DEFAULT,
} from '../core/model-hub/tier-router.js'

describe('Tier defaults rebind (Task 2.1)', () => {
  it('cheap tier default é claude-haiku-4-5 (AC#1)', () => {
    const model = resolveTierModel('cheap')
    expect(model).toBe('claude-haiku-4-5')
    expect(model).toBe(ANTHROPIC_CHEAP_DEFAULT)
  })

  it('build tier default é claude-sonnet-4-6 (AC#2)', () => {
    const model = resolveTierModel('build')
    expect(model).toBe('claude-sonnet-4-6')
    expect(model).toBe(ANTHROPIC_BUILD_DEFAULT)
  })

  it('frontier tier default é claude-opus-4-8 (AC#3)', () => {
    const model = resolveTierModel('frontier')
    expect(model).toBe('claude-opus-4-8')
    expect(model).toBe(ANTHROPIC_FRONTIER_DEFAULT)
  })

  it('claude-haiku-4-5 existe no MODEL_POOL como cheap', () => {
    const def = MODEL_POOL.find((m) => m.id === 'claude-haiku-4-5')
    expect(def).toBeDefined()
    expect(def?.tier).toBe('cheap')
  })

  it('claude-sonnet-4-6 existe no MODEL_POOL como build', () => {
    const def = MODEL_POOL.find((m) => m.id === 'claude-sonnet-4-6')
    expect(def).toBeDefined()
    expect(def?.tier).toBe('build')
  })

  it('claude-opus-4-8 existe no MODEL_POOL como frontier', () => {
    const def = MODEL_POOL.find((m) => m.id === 'claude-opus-4-8')
    expect(def).toBeDefined()
    expect(def?.tier).toBe('frontier')
  })

  it('resolveTierModel não lança para nenhum tier (AC#4)', () => {
    expect(() => resolveTierModel('cheap')).not.toThrow()
    expect(() => resolveTierModel('build')).not.toThrow()
    expect(() => resolveTierModel('frontier')).not.toThrow()
  })
})

describe('agf model route aceita tier names além de task kinds', () => {
  it('MODEL_POOL tem entradas para os 3 Claude Anthropic defaults', () => {
    const claudeModels = MODEL_POOL.filter((m) => m.id.startsWith('claude-'))
    expect(claudeModels.some((m) => m.id === 'claude-haiku-4-5')).toBe(true)
    expect(claudeModels.some((m) => m.id === 'claude-sonnet-4-6')).toBe(true)
    expect(claudeModels.some((m) => m.id === 'claude-opus-4-8')).toBe(true)
  })
})
