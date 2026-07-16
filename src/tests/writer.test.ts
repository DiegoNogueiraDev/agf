import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  setPretty,
  setSelect,
  setProfile,
  setCurrentCommand,
  setDecisionOnly,
  setAutoFormat,
  setDetectedAgent,
  writeEnvelope,
} from '../core/output/writer.js'

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

describe('decision-only mode (--decision-only)', () => {
  afterEach(() => {
    setDecisionOnly(false)
  })

  it('prints only the compact decision line when the envelope carries a decision', () => {
    setDecisionOnly(true)
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: true, message: 'APPROVED: tudo certo', data: null })
      expect(written.trim()).toBe('✓ APPROVED — tudo certo [llm]')
      expect(written).not.toContain('"ok"')
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('extracts REJECTED from data when message has no decision', () => {
    setDecisionOnly(true)
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: false, data: { summary: 'REJECTED: testes falham' } })
      expect(written).toContain('REJECTED')
      expect(written).toContain('testes falham')
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('falls back to the full envelope when no decision is present', () => {
    setDecisionOnly(true)
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: true, data: { value: 1 } })
      expect(written).toContain('"ok"')
    } finally {
      writeSpy.mockRestore()
    }
  })
})

describe('auto-format mode (--auto-format, node_wire_dc2dac1c8796)', () => {
  afterEach(() => {
    setAutoFormat(false)
    setDetectedAgent(null)
  })

  it('AC1: routes human consumers (no detected agent) to rich (pretty, multi-line) output', () => {
    setAutoFormat(true)
    setDetectedAgent(null)
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: true, data: { value: 1 } })
      expect(written).toContain('\n  ')
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('AC2: routes detected-agent consumers to json (compact, single-line) output', () => {
    setAutoFormat(true)
    setDetectedAgent('Claude Code')
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: true, data: { value: 1 } })
      expect(written.trim().split('\n').length).toBe(1)
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('is a no-op when disabled — pretty stays governed by --pretty alone', () => {
    setAutoFormat(false)
    setDetectedAgent(null)
    let written = ''
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += chunk
      return true
    })
    try {
      writeEnvelope({ ok: true, data: { value: 1 } })
      expect(written.trim().split('\n').length).toBe(1)
    } finally {
      writeSpy.mockRestore()
    }
  })
})
