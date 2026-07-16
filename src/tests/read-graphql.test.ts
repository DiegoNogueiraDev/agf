import { describe, it, expect } from 'vitest'
import { parseGraphql } from '../core/parser/read-graphql.js'

describe('parseGraphql', () => {
  it('returns empty entries for empty string', () => {
    const result = parseGraphql('')
    expect(result.entries).toHaveLength(0)
    expect(result.raw).toBe('')
  })

  it('returns empty entries for whitespace-only input', () => {
    const result = parseGraphql('   \n  ')
    expect(result.entries).toHaveLength(0)
  })

  it('parses a type definition', () => {
    const content = 'type User { id: ID! name: String }'
    const result = parseGraphql(content)
    const entry = result.entries.find((e) => e.kind === 'type')
    expect(entry?.name).toBe('User')
  })

  it('parses an input type', () => {
    const content = 'input CreateUserInput { name: String! }'
    const result = parseGraphql(content)
    const entry = result.entries.find((e) => e.kind === 'input')
    expect(entry?.name).toBe('CreateUserInput')
  })

  it('parses an enum', () => {
    const content = 'enum Role { ADMIN MEMBER }'
    const result = parseGraphql(content)
    const entry = result.entries.find((e) => e.kind === 'enum')
    expect(entry?.name).toBe('Role')
  })

  it('parses a query operation', () => {
    const content = 'query GetUser { user { id } }'
    const result = parseGraphql(content)
    const entry = result.entries.find((e) => e.kind === 'query')
    expect(entry?.name).toBe('GetUser')
  })

  it('parses a mutation operation', () => {
    const content = 'mutation CreateUser($name: String!) { createUser(name: $name) { id } }'
    const result = parseGraphql(content)
    const entry = result.entries.find((e) => e.kind === 'mutation')
    expect(entry?.name).toBe('CreateUser')
  })

  it('preserves raw content', () => {
    const content = 'type Foo { bar: String }'
    const result = parseGraphql(content)
    expect(result.raw).toBe(content)
  })

  it('parses multiple definitions', () => {
    const content = 'type A { x: Int }\ntype B { y: String }'
    const result = parseGraphql(content)
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
  })
})
