import { describe, it, expect } from 'vitest'
import { scaffoldFile, scaffoldFromContract } from '../tui/scaffold.js'

describe('scaffoldFile', () => {
  it('generates a class scaffold', () => {
    const result = scaffoldFile('MyService', 'src/services', 'class')
    expect(result).toContain('export class MyService')
    expect(result).toContain('@scaffolded')
  })

  it('generates a function scaffold', () => {
    const result = scaffoldFile('myHelper', 'src/utils', 'function')
    expect(result).toContain('export function myHelper')
  })

  it('generates a component scaffold', () => {
    const result = scaffoldFile('UserCard', 'src/components', 'component')
    expect(result).toContain('export interface UserCardProps')
    expect(result).toContain('export function UserCard')
  })

  it('generates an interface scaffold', () => {
    const result = scaffoldFile('UserModel', 'src/models', 'interface')
    expect(result).toContain('export interface UserModel')
  })

  it('generates a type scaffold', () => {
    const result = scaffoldFile('UserId', 'src/types', 'type')
    expect(result).toContain('export type UserId')
  })

  it('strips trailing slash from dir', () => {
    const result = scaffoldFile('Foo', 'src/foo/', 'class')
    expect(result).not.toContain('src/foo//')
    expect(result).toContain('src/foo/Foo.ts')
  })

  it('result is a non-empty string', () => {
    const result = scaffoldFile('Test', 'src', 'function')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('scaffoldFromContract', () => {
  it('includes contract content in output', () => {
    const contract = 'interface FooContract { run(): void }'
    const result = scaffoldFromContract('Foo', 'src', contract)
    expect(result).toContain(contract)
  })

  it('includes the scaffolded class', () => {
    const result = scaffoldFromContract('Bar', 'src', 'type Bar = string')
    expect(result).toContain('export class Bar')
  })

  it('marks output as scaffolded', () => {
    const result = scaffoldFromContract('Baz', 'src/core', 'interface Baz {}')
    expect(result).toContain('@scaffolded')
  })
})
