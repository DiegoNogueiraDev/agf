import { describe, it, expect } from 'vitest'
import { scaffoldFile, scaffoldFromContract } from '../tui/scaffold.js'

describe('Scaffold', () => {
  it('scaffoldFile gera esqueleto TypeScript', () => {
    const result = scaffoldFile('UserService', 'src/services', 'class')
    expect(result).toContain('export class UserService')
    expect(result).toContain('@scaffolded')
  })

  it('scaffoldFile gera esqueleto function', () => {
    const result = scaffoldFile('calculateTotal', 'src/utils', 'function')
    expect(result).toContain('export function calculateTotal')
  })

  it('scaffoldFromContract inclui a interface do contrato', () => {
    const contract = `export interface UserContract {
  id: string;
  name: string;
}`
    const result = scaffoldFromContract('UserService', 'src/services', contract)
    expect(result).toContain('UserContract')
    expect(result).toContain('export class UserService')
  })

  it('gera comment header com path', () => {
    const result = scaffoldFile('Foo', 'src/components', 'component')
    expect(result).toContain('@file src/components/Foo.ts')
  })
})
