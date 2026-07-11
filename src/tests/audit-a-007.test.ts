/**
 * AUDIT-007 — `+`-prefixed list items were neither normalized to `-` nor matched
 * by the `-`-only bullet parser, so they were dropped.
 */
import { describe, it, expect } from 'vitest'
import { normalize } from '../core/parser/normalize.js'
import { classifySection } from '../core/parser/classify.js'

describe('AUDIT-007: `+` list markers are supported', () => {
  it('normalize converts `+ item` to `- item`', () => {
    expect(normalize('+ first\n+ second')).toBe('- first\n- second')
  })

  it('classifySection parses `+`-prefixed bullet items', () => {
    const block = classifySection('Items', '+ Implementar login\n+ Criar dashboard', 2, 1, 3)
    expect(block.items).toHaveLength(2)
  })
})
