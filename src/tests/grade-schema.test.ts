import { describe, it, expect } from 'vitest'
import { GradeSchema } from '../schemas/grade-schema.js'

describe('GradeSchema', () => {
  it('accepts valid grades A-F', () => {
    for (const g of ['A', 'B', 'C', 'D', 'F']) {
      const result = GradeSchema.safeParse(g)
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid grade string', () => {
    expect(GradeSchema.safeParse('E').success).toBe(false)
    expect(GradeSchema.safeParse('Z').success).toBe(false)
    expect(GradeSchema.safeParse('').success).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(GradeSchema.safeParse(1).success).toBe(false)
    expect(GradeSchema.safeParse(null).success).toBe(false)
  })
})
