import { describe, it, expect } from 'vitest'
import { scaffoldContract } from '../core/scaffolder/contract-scaffolder.js'
import type { ContractSpec } from '../core/scaffolder/contract-scaffolder.js'

function makeSpec(overrides: Partial<ContractSpec> = {}): ContractSpec {
  return {
    id: 'spec-1',
    name: 'CreateUser',
    inputSchemaRef: 'CreateUserSchema',
    outputSchemaRef: 'UserSchema',
    handlerType: 'rest',
    ...overrides,
  }
}

describe('scaffoldContract', () => {
  it('returns a handlerFile with path and content', () => {
    const result = scaffoldContract(makeSpec())
    expect(typeof result.handlerFile.path).toBe('string')
    expect(typeof result.handlerFile.content).toBe('string')
    expect(result.handlerFile.content.length).toBeGreaterThan(0)
  })

  it('uses default handlerDir when not provided', () => {
    const result = scaffoldContract(makeSpec())
    expect(result.handlerFile.path).toContain('src/core/generated/handlers/')
  })

  it('uses custom handlerDir when provided', () => {
    const result = scaffoldContract(makeSpec(), { handlerDir: 'src/handlers/' })
    expect(result.handlerFile.path).toContain('src/handlers/')
  })

  it('path includes kebab-case name', () => {
    const result = scaffoldContract(makeSpec({ name: 'CreateUser' }))
    expect(result.handlerFile.path).toContain('create-user')
  })

  it('returns no warnings when outputSchemaRef is set', () => {
    const result = scaffoldContract(makeSpec())
    expect(result.warnings).toHaveLength(0)
  })

  it('returns warning when outputSchemaRef is null', () => {
    const result = scaffoldContract(makeSpec({ outputSchemaRef: null }))
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('CreateUser')
  })

  it('generates rest handler for rest handlerType', () => {
    const result = scaffoldContract(makeSpec({ handlerType: 'rest' }))
    expect(result.handlerFile.content).toContain('Request')
    expect(result.handlerFile.content).toContain('Response')
  })

  it('generates mcp handler for mcp handlerType', () => {
    const result = scaffoldContract(makeSpec({ handlerType: 'mcp' }))
    expect(result.handlerFile.content).not.toContain('express')
  })

  it('includes inputSchemaRef in generated content', () => {
    const result = scaffoldContract(makeSpec({ inputSchemaRef: 'MyInputSchema' }))
    expect(result.handlerFile.content).toContain('MyInputSchema')
  })

  it('includes AUTO-GENERATED comment', () => {
    const result = scaffoldContract(makeSpec())
    expect(result.handlerFile.content).toContain('AUTO-GENERATED')
  })

  // AC1: given spec with coreFnRef, generated handler calls core fn (no TODO)
  it('calls core fn when coreFnRef is provided — no TODO placeholder', () => {
    const result = scaffoldContract(makeSpec({ coreFnRef: 'createUser' }))
    expect(result.handlerFile.content).not.toContain('TODO: call core function')
    expect(result.handlerFile.content).toContain('createUser(')
  })

  it('no coreFnRef → still emits TODO placeholder (backward compat)', () => {
    const result = scaffoldContract(makeSpec())
    expect(result.handlerFile.content).toContain('TODO: call core function')
  })

  // AC2: generated test file is exercised (not orphaned .failing)
  it('coreFnRef triggers test file generation in result', () => {
    const result = scaffoldContract(makeSpec({ coreFnRef: 'createUser' }))
    expect(result.testFile).toBeDefined()
    expect(result.testFile!.content).toContain('createUser')
  })
})
