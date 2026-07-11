import { describe, it, expect } from 'vitest'
import {
  PATTERN_TO_LESSON_THRESHOLD,
  isLessonsConsultantDisabled,
  computeActrActivation,
  formatLessonsForContext,
  type LessonRow,
} from '../core/autonomy/lessons-store.js'

function makeLessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'lesson-abc-123',
    patternHash: 'abc123',
    description: 'Test description',
    recommendedAction: 'do something',
    confidence: 0.8,
    appliedCount: 3,
    source: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('PATTERN_TO_LESSON_THRESHOLD', () => {
  it('is 3', () => {
    expect(PATTERN_TO_LESSON_THRESHOLD).toBe(3)
  })
})

describe('isLessonsConsultantDisabled', () => {
  it('returns false when env var is not set', () => {
    expect(isLessonsConsultantDisabled({})).toBe(false)
  })

  it('returns true when env var is "off"', () => {
    expect(isLessonsConsultantDisabled({ MCP_GRAPH_LESSONS_CONSULTANT: 'off' })).toBe(true)
  })

  it('returns false when env var is any other value', () => {
    expect(isLessonsConsultantDisabled({ MCP_GRAPH_LESSONS_CONSULTANT: 'on' })).toBe(false)
    expect(isLessonsConsultantDisabled({ MCP_GRAPH_LESSONS_CONSULTANT: '' })).toBe(false)
  })
})

describe('computeActrActivation', () => {
  it('returns a value between 0 and 1', () => {
    const lesson = makeLessonRow({ confidence: 0.8, appliedCount: 3, createdAt: new Date().toISOString() })
    const activation = computeActrActivation(lesson)
    expect(activation).toBeGreaterThanOrEqual(0)
    expect(activation).toBeLessThanOrEqual(1)
  })

  it('returns higher activation for higher confidence', () => {
    const now = Date.now()
    const createdAt = new Date(now).toISOString()
    const lowConf = computeActrActivation(makeLessonRow({ confidence: 0.2, appliedCount: 0, createdAt }), now)
    const highConf = computeActrActivation(makeLessonRow({ confidence: 0.9, appliedCount: 0, createdAt }), now)
    expect(highConf).toBeGreaterThan(lowConf)
  })

  it('decays over time — 30-day-old lesson has lower activation than fresh', () => {
    const now = Date.now()
    const freshDate = new Date(now).toISOString()
    const oldDate = new Date(now - 30 * 86_400_000).toISOString()
    const fresh = computeActrActivation(makeLessonRow({ confidence: 0.8, appliedCount: 3, createdAt: freshDate }), now)
    const old = computeActrActivation(makeLessonRow({ confidence: 0.8, appliedCount: 3, createdAt: oldDate }), now)
    expect(fresh).toBeGreaterThan(old)
  })

  it('higher appliedCount increases activation', () => {
    const now = Date.now()
    const createdAt = new Date(now).toISOString()
    const low = computeActrActivation(makeLessonRow({ confidence: 0.5, appliedCount: 0, createdAt }), now)
    const high = computeActrActivation(makeLessonRow({ confidence: 0.5, appliedCount: 20, createdAt }), now)
    expect(high).toBeGreaterThan(low)
  })

  it('caps at 1 even with very high frequency', () => {
    const now = Date.now()
    const createdAt = new Date(now).toISOString()
    const activation = computeActrActivation(makeLessonRow({ confidence: 1.0, appliedCount: 10000, createdAt }), now)
    expect(activation).toBeLessThanOrEqual(1.0)
  })
})

describe('formatLessonsForContext', () => {
  it('returns empty string when given empty array', () => {
    expect(formatLessonsForContext([])).toBe('')
  })

  it('returns formatted string with lesson details', () => {
    const lesson = makeLessonRow({
      description: 'some insight',
      recommendedAction: 'fix it',
      confidence: 0.7,
      appliedCount: 2,
    })
    const result = formatLessonsForContext([lesson])
    expect(result).toContain('Past lessons:')
    expect(result).toContain('fix it')
    expect(result).toContain('some insight')
    expect(result).toContain('conf=0.70')
    expect(result).toContain('applied=2x')
  })

  it('truncates output when it exceeds maxChars', () => {
    const longLesson = makeLessonRow({ description: 'x'.repeat(900), recommendedAction: 'act' })
    const result = formatLessonsForContext([longLesson], 100)
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result.endsWith('...')).toBe(true)
  })

  it('numbers lessons starting at 1', () => {
    const l1 = makeLessonRow({ description: 'first' })
    const l2 = makeLessonRow({ description: 'second' })
    const result = formatLessonsForContext([l1, l2])
    expect(result).toContain('1.')
    expect(result).toContain('2.')
  })

  it('includes all lessons within maxChars', () => {
    const l1 = makeLessonRow({ description: 'A' })
    const l2 = makeLessonRow({ description: 'B' })
    const result = formatLessonsForContext([l1, l2], 10000)
    expect(result).toContain('A')
    expect(result).toContain('B')
  })
})
