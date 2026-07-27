import { describe, it, expect } from 'vitest'
import { statusPill } from '../tui/widgets/status-pill.js'

describe('statusPill', () => {
  it('renders done with checkmark icon', () => {
    expect(statusPill('done')).toContain('✔')
    expect(statusPill('done')).toContain('done')
  })

  it('renders in_progress with bullet icon', () => {
    const result = statusPill('in_progress')
    expect(result).toContain('●')
    expect(result).toContain('in_progress')
  })

  it('renders blocked with X icon', () => {
    const result = statusPill('blocked')
    expect(result).toContain('✘')
  })

  it('renders backlog with open circle', () => {
    const result = statusPill('backlog')
    expect(result).toContain('○')
  })

  it('renders ready with icon', () => {
    const result = statusPill('ready')
    expect(result).toContain('●')
  })

  it('returns fallback for unknown status', () => {
    const result = statusPill('unknown_status')
    expect(result).toContain('unknown_status')
    expect(result).toContain('[')
    expect(result).toContain(']')
  })

  it('returns a string for all known statuses', () => {
    const statuses = ['done', 'in_progress', 'blocked', 'backlog', 'ready']
    for (const s of statuses) {
      expect(typeof statusPill(s)).toBe('string')
    }
  })
})
