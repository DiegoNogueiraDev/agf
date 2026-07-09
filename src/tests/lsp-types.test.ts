import { describe, it, expect } from 'vitest'
import { LspDiagnosticSeverity, LspServerConfigSchema, LspDiagnosticSchema } from '../core/lsp/lsp-types.js'

describe('LspDiagnosticSeverity', () => {
  it('has Error severity as 1', () => {
    expect(LspDiagnosticSeverity.Error).toBe(1)
  })

  it('has Warning severity as 2', () => {
    expect(LspDiagnosticSeverity.Warning).toBe(2)
  })

  it('has Information severity as 3', () => {
    expect(LspDiagnosticSeverity.Information).toBe(3)
  })

  it('has Hint severity as 4', () => {
    expect(LspDiagnosticSeverity.Hint).toBe(4)
  })

  it('is a non-null object', () => {
    expect(typeof LspDiagnosticSeverity).toBe('object')
    expect(LspDiagnosticSeverity).not.toBeNull()
  })
})

describe('LspServerConfigSchema', () => {
  it('is a Zod schema object', () => {
    expect(typeof LspServerConfigSchema).toBe('object')
    expect(typeof LspServerConfigSchema.parse).toBe('function')
  })
})

describe('LspDiagnosticSchema', () => {
  it('is a Zod schema object', () => {
    expect(typeof LspDiagnosticSchema).toBe('object')
    expect(typeof LspDiagnosticSchema.safeParse).toBe('function')
  })
})
