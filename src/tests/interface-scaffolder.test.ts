import { describe, it, expect } from 'vitest'
import { scaffoldInterface } from '../core/scaffolder/interface-scaffolder.js'
import type { InterfaceSpec } from '../core/scaffolder/interface-scaffolder.js'

function makeSpec(overrides: Partial<InterfaceSpec> = {}): InterfaceSpec {
  return {
    id: 'n1',
    name: 'UserRepository',
    description: 'User data access',
    methods: [
      { name: 'findById', params: 'id: string', returns: 'Promise<User | null>' },
      { name: 'save', params: 'user: User', returns: 'Promise<void>', description: 'Persist user' },
    ],
    ...overrides,
  }
}

describe('scaffoldInterface', () => {
  it('returns interfaceFile and testFile', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result).toHaveProperty('interfaceFile')
    expect(result).toHaveProperty('testFile')
  })

  it('interfaceFile.content contains the interface name', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.interfaceFile.content).toContain('UserRepository')
  })

  it('interfaceFile.content contains all method signatures', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.interfaceFile.content).toContain('findById(id: string): Promise<User | null>')
    expect(result.interfaceFile.content).toContain('save(user: User): Promise<void>')
  })

  it('interfaceFile.content includes method descriptions as JSDoc', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.interfaceFile.content).toContain('Persist user')
  })

  it('testFile.content contains describe block with interface name', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.testFile.content).toContain('UserRepository')
    expect(result.testFile.content).toContain('describe(')
  })

  it('testFile.content contains it.failing stubs for each method', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.testFile.content).toContain('it.failing')
    expect(result.testFile.content).toContain('findById')
    expect(result.testFile.content).toContain('save')
  })

  it('testFile.path ends with .test.ts', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.testFile.path).toMatch(/\.test\.ts$/)
  })

  it('interfaceFile.path ends with .ts', () => {
    const result = scaffoldInterface(makeSpec())
    expect(result.interfaceFile.path).toMatch(/\.ts$/)
  })

  it('handles spec with no methods gracefully', () => {
    const result = scaffoldInterface(makeSpec({ methods: [] }))
    expect(result.interfaceFile.content).toContain('UserRepository')
    expect(result.testFile.content).toContain('UserRepository')
  })

  it('uses custom interfaceDir when provided', () => {
    const result = scaffoldInterface(makeSpec(), { interfaceDir: 'src/ports' })
    expect(result.interfaceFile.path).toContain('src/ports')
  })
})
