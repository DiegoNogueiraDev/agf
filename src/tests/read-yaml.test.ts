import { describe, it, expect } from 'vitest'
import { parseYaml } from '../core/parser/read-yaml.js'

describe('parseYaml', () => {
  it('returns empty entries for empty content', () => {
    const result = parseYaml('')
    expect(result.entries).toHaveLength(0)
  })

  it('returns empty entries for non-object (array) yaml', () => {
    const result = parseYaml('- item1\n- item2')
    expect(result.entries).toHaveLength(0)
  })

  it('preserves raw content', () => {
    const content = 'bad yaml ::::'
    const result = parseYaml(content)
    expect(result.raw).toBe(content)
  })

  it('parses simple key-value entries', () => {
    const content = 'name: Alice\nage: 30'
    const result = parseYaml(content)
    const nameEntry = result.entries.find((e) => e.key === 'name')
    expect(nameEntry).toBeDefined()
    expect(nameEntry!.valueType).toBe('string')
  })

  it('marks numeric values with valueType number', () => {
    const content = 'count: 42'
    const result = parseYaml(content)
    const entry = result.entries.find((e) => e.key === 'count')
    expect(entry?.valueType).toBe('number')
  })

  it('marks nested objects with hasChildren true', () => {
    const content = 'config:\n  host: localhost\n  port: 5432'
    const result = parseYaml(content)
    const entry = result.entries.find((e) => e.key === 'config')
    expect(entry?.hasChildren).toBe(true)
  })

  it('marks scalar values with hasChildren false', () => {
    const content = 'version: "1.0"'
    const result = parseYaml(content)
    const entry = result.entries.find((e) => e.key === 'version')
    expect(entry?.hasChildren).toBe(false)
  })

  it('returns array of entries with key field', () => {
    const content = 'foo: bar\nbaz: qux'
    const result = parseYaml(content)
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
    for (const e of result.entries) {
      expect(typeof e.key).toBe('string')
    }
  })
})
