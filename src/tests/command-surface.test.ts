import { describe, it, expect } from 'vitest'
import { listCommandNames, buildCommandSurface } from '../core/config/command-surface.js'

describe('listCommandNames', () => {
  it('returns an array', () => {
    const names = listCommandNames()
    expect(Array.isArray(names)).toBe(true)
  })

  it('returns non-empty list', () => {
    const names = listCommandNames()
    expect(names.length).toBeGreaterThan(0)
  })

  it('all entries are strings', () => {
    const names = listCommandNames()
    for (const name of names) expect(typeof name).toBe('string')
  })

  it('includes known commands', () => {
    const names = listCommandNames()
    expect(names).toContain('next')
  })

  it('has no duplicates', () => {
    const names = listCommandNames()
    expect(names.length).toBe(new Set(names).size)
  })
})

describe('buildCommandSurface', () => {
  it('returns a string', () => {
    expect(typeof buildCommandSurface()).toBe('string')
  })

  it('includes markdown table header', () => {
    const surface = buildCommandSurface()
    expect(surface).toContain('| Comando |')
  })

  it('includes agf prefix in command names', () => {
    const surface = buildCommandSurface()
    expect(surface).toContain('`agf ')
  })
})
