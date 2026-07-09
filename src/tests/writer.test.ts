import { describe, it, expect, vi, afterEach } from 'vitest'
import { setPretty, setSelect, setProfile, setCurrentCommand, writeEnvelope } from '../core/output/writer.js'

describe('writer module state', () => {
  afterEach(() => {
    setPretty(false)
    setSelect([])
    setProfile('')
    setCurrentCommand('')
  })

  it('setPretty does not throw', () => {
    expect(() => setPretty(true)).not.toThrow()
    expect(() => setPretty(false)).not.toThrow()
  })

  it('setSelect does not throw with empty array', () => {
    expect(() => setSelect([])).not.toThrow()
  })

  it('setSelect does not throw with paths', () => {
    expect(() => setSelect(['data.score', 'data.grade'])).not.toThrow()
  })

  it('setProfile does not throw', () => {
    expect(() => setProfile('default')).not.toThrow()
  })

  it('setCurrentCommand does not throw', () => {
    expect(() => setCurrentCommand('agf harness')).not.toThrow()
  })
})

describe('writeEnvelope', () => {
  it('writes to process.stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      writeEnvelope({ ok: true, data: { value: 42 } })
      expect(writeSpy).toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('does not throw for minimal envelope', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      expect(() => writeEnvelope({ ok: true, data: null })).not.toThrow()
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('writes JSON string to stdout', () => {
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: true, data: { x: 1 } })
      expect(written.length).toBeGreaterThan(0)
    } finally {
      writeSpy.mockRestore()
    }
  })
})
