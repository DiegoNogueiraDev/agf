/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scoreToGrade } from '../../core/utils/grading.js'

describe('grading — scoreToGrade', () => {
  it('90+ retorna A', () => {
    expect(scoreToGrade(90)).toBe('A')
    expect(scoreToGrade(100)).toBe('A')
  })

  it('75-89 retorna B', () => {
    expect(scoreToGrade(75)).toBe('B')
    expect(scoreToGrade(85)).toBe('B')
  })

  it('60-74 retorna C', () => {
    expect(scoreToGrade(60)).toBe('C')
    expect(scoreToGrade(74)).toBe('C')
  })

  it('40-59 retorna D', () => {
    expect(scoreToGrade(40)).toBe('D')
    expect(scoreToGrade(50)).toBe('D')
  })

  it('<40 retorna F', () => {
    expect(scoreToGrade(0)).toBe('F')
    expect(scoreToGrade(39)).toBe('F')
  })

  it('lida com extremos', () => {
    expect(scoreToGrade(-1)).toBe('F')
    expect(scoreToGrade(200)).toBe('A')
  })
})
