/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_3f9de549e761 — formatElapsed: duração compacta para o spinner da TUI.
 */
import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../tui/elapsed.js'

describe('formatElapsed — duração compacta (#F3)', () => {
  it("segundos: 5000ms → '5s'", () => {
    expect(formatElapsed(5000)).toBe('5s')
  })

  it("minutos+segundos: 83000ms → '1m 23s'", () => {
    expect(formatElapsed(83000)).toBe('1m 23s')
  })

  it("horas+minutos: 3720000ms → '1h 02m'", () => {
    expect(formatElapsed(3720000)).toBe('1h 02m')
  })

  it("zero: 0ms → '0s' sem quebrar", () => {
    expect(formatElapsed(0)).toBe('0s')
  })

  it('negativo é tratado como 0', () => {
    expect(formatElapsed(-100)).toBe('0s')
  })
})
