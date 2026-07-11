/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { listSpecTemplateLines, generateSpec, validateSpec } from '../../cli/commands/spec-cmd.js'
import { listSpecTemplates } from '../../core/spec-templates/built-in-spec-templates.js'

describe('spec-cmd — conectado ao core/spec-templates', () => {
  it('lista os templates built-in reais', () => {
    const lines = listSpecTemplateLines()
    expect(lines.length).toBe(listSpecTemplates().length)
    expect(lines.length).toBeGreaterThanOrEqual(4)
    expect(lines.join('\n')).toContain('prd-template')
  })

  it('gera markdown para template conhecido e null para desconhecido', () => {
    const doc = generateSpec('prd-template', { projectName: 'Acme' })
    expect(doc).not.toBeNull()
    expect(doc!).toContain('# ANALYZE: Acme')
    expect(doc!).toContain('## Vision')
    expect(generateSpec('nao-existe')).toBeNull()
  })

  it('valida um doc gerado como válido e um doc vazio como inválido', () => {
    const doc = generateSpec('prd-template', { projectName: 'Acme' })!
    const ok = validateSpec(doc, 'prd-template')
    expect(ok).not.toBeNull()
    expect(ok!.valid).toBe(true)
    expect(ok!.missing).toEqual([])

    const bad = validateSpec('# nada aqui', 'prd-template')
    expect(bad!.valid).toBe(false)
    expect(bad!.missing.length).toBeGreaterThan(0)
  })

  it('validate retorna null para template desconhecido', () => {
    expect(validateSpec('qualquer', 'nao-existe')).toBeNull()
  })
})
