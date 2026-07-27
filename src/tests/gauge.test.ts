import { describe, it, expect } from 'vitest'
import { gauge } from '../tui/widgets/gauge.js'

describe('gauge', () => {
  it('returns a string', () => {
    expect(typeof gauge(50)).toBe('string')
  })

  it('0% fills none', () => {
    const result = gauge(0, { width: 10 })
    expect(result).toContain('░░░░░░░░░░')
    expect(result).not.toContain('█')
  })

  it('100% fills all', () => {
    const result = gauge(100, { width: 10 })
    expect(result).toContain('██████████')
    expect(result).not.toContain('░')
  })

  it('50% fills half', () => {
    const result = gauge(50, { width: 10 })
    const filled = (result.match(/█/g) ?? []).length
    const empty = (result.match(/░/g) ?? []).length
    expect(filled).toBe(5)
    expect(empty).toBe(5)
  })

  it('clamps negative to 0', () => {
    const result = gauge(-10, { width: 10 })
    expect(result).toContain('0%')
    expect(result).not.toContain('█')
  })

  it('clamps values above 100 to 100', () => {
    const result = gauge(150, { width: 10 })
    expect(result).toContain('100%')
  })

  it('includes percentage in output', () => {
    expect(gauge(75)).toContain('75%')
  })

  it('default width is 20', () => {
    const result = gauge(0)
    const total = (result.match(/[█░]/g) ?? []).length
    expect(total).toBe(20)
  })

  it('custom width applies', () => {
    const result = gauge(0, { width: 5 })
    const total = (result.match(/[█░]/g) ?? []).length
    expect(total).toBe(5)
  })

  it('includes label when provided', () => {
    const result = gauge(50, { label: 'Progress' })
    expect(result).toContain('Progress')
  })

  it('no label prefix when label is omitted', () => {
    const result = gauge(50)
    expect(result.startsWith('[')).toBe(true)
  })
})
