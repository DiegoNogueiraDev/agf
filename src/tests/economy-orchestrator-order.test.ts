/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { ECONOMY_PIPELINE_ORDER } from '../core/economy/economy-pipeline.js'

describe('ECONOMY_PIPELINE_ORDER', () => {
  it('inclui compress na ordem canônica', () => {
    expect(ECONOMY_PIPELINE_ORDER.includes('compress')).toBe(true)
  })

  it('inclui caveman-input na ordem canônica', () => {
    expect(ECONOMY_PIPELINE_ORDER.includes('caveman-input')).toBe(true)
  })

  it('compress vem antes de llm', () => {
    const compressIdx = ECONOMY_PIPELINE_ORDER.indexOf('compress')
    const llmIdx = ECONOMY_PIPELINE_ORDER.indexOf('llm')
    expect(compressIdx).toBeLessThan(llmIdx)
  })

  it('caveman-input vem antes de llm', () => {
    const cmIdx = ECONOMY_PIPELINE_ORDER.indexOf('caveman-input')
    const llmIdx = ECONOMY_PIPELINE_ORDER.indexOf('llm')
    expect(cmIdx).toBeLessThan(llmIdx)
  })

  it('ordem canônica é estável (9 stages)', () => {
    expect(ECONOMY_PIPELINE_ORDER.length).toBe(9)
  })

  it('inclui content-router na ordem canônica', () => {
    expect(ECONOMY_PIPELINE_ORDER.includes('content-router')).toBe(true)
    const compressIdx = ECONOMY_PIPELINE_ORDER.indexOf('compress')
    const crIdx = ECONOMY_PIPELINE_ORDER.indexOf('content-router')
    const cavIdx = ECONOMY_PIPELINE_ORDER.indexOf('caveman-input')
    expect(compressIdx).toBeLessThan(crIdx)
    expect(crIdx).toBeLessThan(cavIdx)
  })
})
