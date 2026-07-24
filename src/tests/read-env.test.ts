import { describe, it, expect } from 'vitest'
import { parseEnv } from '../core/parser/read-env.js'

describe('parseEnv', () => {
  it('returns empty entries for empty content', () => {
    const result = parseEnv('')
    expect(result.entries).toHaveLength(0)
  })

  it('skips comment lines', () => {
    const content = '# This is a comment\nFOO=bar'
    const result = parseEnv(content)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].key).toBe('FOO')
  })

  it('skips blank lines', () => {
    const content = '\n\nFOO=bar\n\n'
    const result = parseEnv(content)
    expect(result.entries).toHaveLength(1)
  })

  it('skips lines without equals sign', () => {
    const content = 'INVALID_LINE\nFOO=bar'
    const result = parseEnv(content)
    const entry = result.entries.find((e) => e.key === 'INVALID_LINE')
    expect(entry).toBeUndefined()
  })

  it('parses key-value pairs', () => {
    const content = 'DATABASE_URL=postgres://localhost/db'
    const result = parseEnv(content)
    expect(result.entries[0].key).toBe('DATABASE_URL')
    expect(result.entries[0].value).toBe('postgres://localhost/db')
    expect(result.entries[0].hasValue).toBe(true)
  })

  it('marks empty value as hasValue false', () => {
    const content = 'EMPTY_VAR='
    const result = parseEnv(content)
    expect(result.entries[0].hasValue).toBe(false)
  })

  it('marks SECRET keys as isSecret true', () => {
    const secretKeys = ['API_KEY', 'AUTH_TOKEN', 'DB_PASSWORD', 'PRIVATE_KEY', 'CERT_FILE']
    for (const key of secretKeys) {
      const result = parseEnv(`${key}=value`)
      expect(result.entries[0].isSecret, `${key} should be secret`).toBe(true)
    }
  })

  it('marks non-secret keys as isSecret false', () => {
    const content = 'APP_NAME=myapp'
    const result = parseEnv(content)
    expect(result.entries[0].isSecret).toBe(false)
  })

  it('preserves raw content', () => {
    const content = 'FOO=bar'
    const result = parseEnv(content)
    expect(result.raw).toBe(content)
  })
})
