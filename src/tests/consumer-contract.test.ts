import { describe, it, expect } from 'vitest'
import { generateContractSection, ERROR_CODES, COMMANDS } from '../core/output/consumer-contract.js'

describe('generateContractSection', () => {
  it('returns a non-empty string', () => {
    const result = generateContractSection()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes a markdown table header', () => {
    const result = generateContractSection()
    expect(result).toContain('| Command |')
    expect(result).toContain('| Args |')
  })

  it('includes known commands in the output', () => {
    const result = generateContractSection()
    expect(result).toContain('agf stats')
    expect(result).toContain('agf next')
    expect(result).toContain('agf check')
  })

  it('includes error code decision logic', () => {
    const result = generateContractSection()
    expect(result).toContain('DOD_FAILED')
    expect(result).toContain('NOT_FOUND')
    expect(result).toContain('NO_TASKS')
  })

  it('mentions --select for token efficiency', () => {
    const result = generateContractSection()
    expect(result).toContain('--select')
  })

  it('mentions minified JSON output format', () => {
    const result = generateContractSection()
    expect(result).toContain('JSON')
  })
})

describe('ERROR_CODES', () => {
  it('is a non-empty object', () => {
    expect(typeof ERROR_CODES).toBe('object')
    expect(Object.keys(ERROR_CODES).length).toBeGreaterThan(0)
  })

  it('has NOT_FOUND error code', () => {
    expect(ERROR_CODES['NOT_FOUND']).toBeDefined()
    expect(typeof ERROR_CODES['NOT_FOUND']).toBe('string')
  })

  it('has DOD_FAILED error code', () => {
    expect(ERROR_CODES['DOD_FAILED']).toBeDefined()
  })

  it('has NO_TASKS error code', () => {
    expect(ERROR_CODES['NO_TASKS']).toBeDefined()
  })

  it('all values are non-empty strings', () => {
    for (const [key, val] of Object.entries(ERROR_CODES)) {
      expect(typeof val, `ERROR_CODES[${key}]`).toBe('string')
      expect(val.length, `ERROR_CODES[${key}] is empty`).toBeGreaterThan(0)
    }
  })
})

describe('COMMANDS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(COMMANDS)).toBe(true)
    expect(COMMANDS.length).toBeGreaterThan(0)
  })

  it('each command has name, args, dataShape, codes', () => {
    for (const cmd of COMMANDS) {
      expect(typeof cmd.name, `cmd.name missing`).toBe('string')
      expect(typeof cmd.args, `cmd[${cmd.name}].args missing`).toBe('string')
      expect(typeof cmd.dataShape, `cmd[${cmd.name}].dataShape missing`).toBe('string')
      expect(Array.isArray(cmd.codes), `cmd[${cmd.name}].codes not array`).toBe(true)
    }
  })

  it('includes stats command', () => {
    expect(COMMANDS.find((c) => c.name === 'stats')).toBeDefined()
  })

  it('includes next command', () => {
    expect(COMMANDS.find((c) => c.name === 'next')).toBeDefined()
  })

  it('next command references NO_TASKS error', () => {
    const next = COMMANDS.find((c) => c.name === 'next')
    expect(next?.codes).toContain('NO_TASKS')
  })
})
