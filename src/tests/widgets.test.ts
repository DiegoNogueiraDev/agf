import { describe, it, expect } from 'vitest'
import { Sparkline, Gauge, DiffLine, StatusPill, ProgressBar } from '../tui/components/Widgets.js'

describe('Sparkline', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof Sparkline).toBe('function')
  })
})

describe('Gauge', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof Gauge).toBe('function')
  })
})

describe('DiffLine', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof DiffLine).toBe('function')
  })
})

describe('StatusPill', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof StatusPill).toBe('function')
  })
})

describe('ProgressBar', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof ProgressBar).toBe('function')
  })
})
