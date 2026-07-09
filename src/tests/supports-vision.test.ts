/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { supportsVision } from '../core/llm/model-capabilities.js'

describe('supportsVision — detecção lenitiva por id de modelo', () => {
  it('famílias com visão → true (independe do slug do provider)', () => {
    expect(supportsVision('gpt-4o')).toBe(true)
    expect(supportsVision('openai/gpt-4o-mini')).toBe(true)
    expect(supportsVision('gemini-3.1-pro')).toBe(true)
    expect(supportsVision('claude-sonnet-4.6')).toBe(true)
    expect(supportsVision('qwen2-vl-7b')).toBe(true)
  })

  it('modelos texto-only → false (preferir OCR determinístico)', () => {
    expect(supportsVision('qwen2.5-coder:7b')).toBe(false)
    expect(supportsVision('deepseek/deepseek-chat')).toBe(false)
    expect(supportsVision('modelo-desconhecido')).toBe(false)
  })
})
