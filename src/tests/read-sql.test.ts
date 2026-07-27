import { describe, it, expect } from 'vitest'
import { parseSql } from '../core/parser/read-sql.js'

describe('parseSql', () => {
  it('returns empty entries for empty content', () => {
    const result = parseSql('')
    expect(result.entries).toHaveLength(0)
  })

  it('parses CREATE TABLE statement', () => {
    const content = 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);'
    const result = parseSql(content)
    const entry = result.entries.find((e) => e.kind === 'table')
    expect(entry?.name).toBe('users')
    expect(entry?.ref).toBe('')
  })

  it('parses CREATE INDEX statement', () => {
    const content = 'CREATE INDEX idx_users_email ON users (email);'
    const result = parseSql(content)
    const entry = result.entries.find((e) => e.kind === 'index')
    expect(entry).toBeDefined()
  })

  it('parses FOREIGN KEY REFERENCES', () => {
    const content = 'FOREIGN KEY (user_id) REFERENCES users (id)'
    const result = parseSql(content)
    const entry = result.entries.find((e) => e.kind === 'foreign_key')
    expect(entry?.ref).toBe('users')
    expect(entry?.name).toBe('')
  })

  it('preserves raw content', () => {
    const content = 'CREATE TABLE foo (id INT);'
    const result = parseSql(content)
    expect(result.raw).toBe(content)
  })

  it('parses multiple statements', () => {
    const content = ['CREATE TABLE orders (id INT);', 'CREATE TABLE items (id INT);'].join('\n')
    const result = parseSql(content)
    const tables = result.entries.filter((e) => e.kind === 'table')
    expect(tables.length).toBeGreaterThanOrEqual(2)
  })

  it('is case-insensitive for CREATE TABLE', () => {
    const content = 'create table products (id int);'
    const result = parseSql(content)
    const entry = result.entries.find((e) => e.kind === 'table')
    expect(entry?.name).toBe('products')
  })
})
