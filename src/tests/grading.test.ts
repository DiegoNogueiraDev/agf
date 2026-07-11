/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scoreToGrade } from '../core/utils/grading.js'

describe('scoreToGrade', () => {
  it('should return A for score >= 90', () => {
    expect(scoreToGrade(90)).toBe('A')
    expect(scoreToGrade(95)).toBe('A')
    expect(scoreToGrade(100)).toBe('A')
  })

  it('should return B for 75 <= score < 90', () => {
    expect(scoreToGrade(75)).toBe('B')
    expect(scoreToGrade(80)).toBe('B')
    expect(scoreToGrade(89)).toBe('B')
  })

  it('should return C for 60 <= score < 75', () => {
    expect(scoreToGrade(60)).toBe('C')
    expect(scoreToGrade(65)).toBe('C')
    expect(scoreToGrade(74)).toBe('C')
  })

  it('should return D for 40 <= score < 60', () => {
    expect(scoreToGrade(40)).toBe('D')
    expect(scoreToGrade(50)).toBe('D')
    expect(scoreToGrade(59)).toBe('D')
  })

  it('should return F for score < 40', () => {
    expect(scoreToGrade(0)).toBe('F')
    expect(scoreToGrade(20)).toBe('F')
    expect(scoreToGrade(39)).toBe('F')
  })

  it('should handle boundary values correctly', () => {
    expect(scoreToGrade(90)).toBe('A')
    expect(scoreToGrade(75)).toBe('B')
    expect(scoreToGrade(60)).toBe('C')
    expect(scoreToGrade(40)).toBe('D')
  })
})
