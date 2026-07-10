/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { parseAc } from '../core/analyzer/ac-parser.js'

describe('parseAc — Acceptance Criteria Parser', () => {
  it('detects GWT format with English keywords', () => {
    const result = parseAc(`Given the user is logged in
When they click submit
Then the form is saved`)
    expect(result.format).toBe('gwt')
    expect(result.steps).toHaveLength(3)
    expect(result.steps![0]).toEqual({ keyword: 'given', text: 'the user is logged in' })
    expect(result.steps![1]).toEqual({ keyword: 'when', text: 'they click submit' })
    expect(result.steps![2]).toEqual({ keyword: 'then', text: 'the form is saved' })
  })

  it('detects GWT format with Portuguese keywords', () => {
    const result = parseAc(`Dado que o usuário está logado
Quando clicar em enviar
Então o formulário é salvo`)
    expect(result.format).toBe('gwt')
    expect(result.steps).toHaveLength(3)
    expect(result.steps![0]).toEqual({ keyword: 'dado', text: 'que o usuário está logado' })
    expect(result.steps![1]).toEqual({ keyword: 'quando', text: 'clicar em enviar' })
    expect(result.steps![2]).toEqual({ keyword: 'então', text: 'o formulário é salvo' })
  })

  it('handles GWT with And/But keywords', () => {
    const result = parseAc(`Given user is on page
And they have admin role
When they delete the record
Then it is removed
But the audit log remains`)
    expect(result.format).toBe('gwt')
    expect(result.steps).toHaveLength(5)
    expect(result.steps![3]).toEqual({ keyword: 'then', text: 'it is removed' })
    expect(result.steps![4]).toEqual({ keyword: 'but', text: 'the audit log remains' })
  })

  it('detects checklist format', () => {
    const result = parseAc(`- [ ] Item one
- [x] Item two
* Item three`)
    expect(result.format).toBe('checklist')
    expect(result.steps).toBeUndefined()
  })

  it('detects free_text format', () => {
    const result = parseAc('The system shall do something useful.')
    expect(result.format).toBe('free_text')
    expect(result.steps).toBeUndefined()
  })

  it('flags testable AC via should/must verbs', () => {
    const result = parseAc('The system should return 200')
    expect(result.isTestable).toBe(true)
  })

  it('flags testable AC via Portuguese verbs', () => {
    const result = parseAc('O sistema deve exibir mensagem de erro')
    expect(result.isTestable).toBe(true)
  })

  it('flags measurable AC with numeric constraint', () => {
    const result = parseAc('Response time must be under 200ms')
    expect(result.isMeasurable).toBe(true)
  })

  it('flags measurable AC with status code', () => {
    const result = parseAc('API returns status 404')
    expect(result.isMeasurable).toBe(true)
  })

  it('handles empty string', () => {
    const result = parseAc('')
    expect(result.format).toBe('free_text')
    expect(result.isTestable).toBe(false)
    expect(result.isMeasurable).toBe(false)
    expect(result.raw).toBe('')
  })

  it('handles whitespace-only string', () => {
    const result = parseAc('   \n  \n  ')
    expect(result.format).toBe('free_text')
    expect(result.raw).toBe('')
  })

  it('preserves original raw text', () => {
    const raw = 'Given a condition\nThen result'
    const result = parseAc(raw)
    expect(result.raw).toBe(raw)
  })

  it('handles mixed GWT with extra blank lines', () => {
    const result = parseAc(`Given step one

When step two

Then step three`)
    expect(result.format).toBe('gwt')
    expect(result.steps).toHaveLength(3)
  })
})
