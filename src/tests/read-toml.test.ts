import { describe, it, expect } from 'vitest'
import { parseToml } from '../core/parser/read-toml.js'

describe('parseToml', () => {
  it('returns ParsedToml with entries and raw', () => {
    const result = parseToml('key = "value"')
    expect(typeof result).toBe('object')
    expect(Array.isArray(result.entries)).toBe(true)
    expect(typeof result.raw).toBe('string')
  })

  it('preserves raw content', () => {
    const content = 'key = "value"\nother = 42'
    const result = parseToml(content)
    expect(result.raw).toBe(content)
  })

  it('parses a simple key=value pair', () => {
    const result = parseToml('name = "agent-graph-flow"')
    expect(result.entries.length).toBeGreaterThan(0)
    const entry = result.entries.find((e) => e.key === 'name')
    expect(entry).toBeDefined()
  })

  it('detects string value type', () => {
    const result = parseToml('greeting = "hello"')
    const entry = result.entries.find((e) => e.key === 'greeting')
    expect(entry?.valueType).toBe('string')
  })

  it('detects boolean value type', () => {
    const result = parseToml('enabled = true')
    const entry = result.entries.find((e) => e.key === 'enabled')
    expect(entry?.valueType).toBe('boolean')
  })

  it('detects number value type', () => {
    const result = parseToml('port = 8080')
    const entry = result.entries.find((e) => e.key === 'port')
    expect(entry?.valueType).toBe('number')
  })

  it('detects array value type', () => {
    const result = parseToml('tags = ["a", "b"]')
    const entry = result.entries.find((e) => e.key === 'tags')
    expect(entry?.valueType).toBe('array')
  })

  it('parses section headers as entries with hasChildren', () => {
    const result = parseToml('[database]\nhost = "localhost"')
    const section = result.entries.find((e) => e.key === 'database')
    expect(section).toBeDefined()
    expect(section?.hasChildren).toBe(true)
  })

  it('handles empty string', () => {
    const result = parseToml('')
    expect(result.entries).toEqual([])
    expect(result.raw).toBe('')
  })

  it('ignores comment lines', () => {
    const result = parseToml('# This is a comment\nkey = "val"')
    const entry = result.entries.find((e) => e.key === 'key')
    expect(entry).toBeDefined()
  })
})
