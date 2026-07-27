/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do controlador proporcional do governador (E3.T2 — node_1c8d70829a47).
 * Termostato: erro = (medido − alvo)/alvo; |erro| dentro da histerese → zero
 * atuações; fora → move os knobs das levers HABILITADAS na direção de mais/menos
 * compressão, sempre dentro dos clamps. Simulação determinística prova convergência.
 */

import { describe, it, expect } from 'vitest'
import { GOVERNOR_KNOBS, governorTick, type Actuation } from '../core/economy/budget-governor.js'

/** currentParams stub: sempre o ponto neutro (min) de cada knob. */
function paramsAtMin(): (lever: string, param: string) => number {
  return (lever, param) => {
    const knob = GOVERNOR_KNOBS.find((k) => k.lever === lever && k.param === param)
    if (!knob) return 0
    return knob.direction === 1 ? knob.min : knob.max
  }
}

describe('governorTick — controlador proporcional com histerese e clamps', () => {
  it('AC1: burnRate 2x acima do alvo move TODOS os knobs habilitados na direcao de mais compressao, dentro dos clamps', () => {
    // Arrange
    const enabled = new Set(GOVERNOR_KNOBS.map((k) => k.lever))

    // Act
    const acts = governorTick({
      measuredRate: 200,
      targetRate: 100,
      currentParam: paramsAtMin(),
      isEnabled: (lever) => enabled.has(lever),
    })

    // Assert — uma atuacao por knob habilitado, movendo p/ o lado compressivo e clampada
    expect(acts.length).toBe(GOVERNOR_KNOBS.length)
    for (const a of acts) {
      const knob = GOVERNOR_KNOBS.find((k) => k.lever === a.lever && k.param === a.param)!
      if (knob.direction === 1) expect(a.to).toBeGreaterThan(a.from)
      else expect(a.to).toBeLessThan(a.from)
      expect(a.to).toBeGreaterThanOrEqual(knob.min)
      expect(a.to).toBeLessThanOrEqual(knob.max)
    }
  })

  it('AC2: burnRate dentro da banda de histerese (+-5%) produz zero atuacoes', () => {
    const acts = governorTick({
      measuredRate: 104,
      targetRate: 100,
      currentParam: paramsAtMin(),
      isEnabled: () => true,
    })
    expect(acts.length).toBe(0)
  })

  it('lever desabilitada nunca e atuada', () => {
    const acts = governorTick({
      measuredRate: 300,
      targetRate: 100,
      currentParam: paramsAtMin(),
      isEnabled: () => false,
    })
    expect(acts.length).toBe(0)
  })

  it('knob ja no limite compressivo permanece clampado (sem overflow)', () => {
    // Arrange — params ja no bound compressivo
    const atCompressiveBound = (lever: string, param: string): number => {
      const knob = GOVERNOR_KNOBS.find((k) => k.lever === lever && k.param === param)!
      return knob.direction === 1 ? knob.max : knob.min
    }

    // Act
    const acts = governorTick({
      measuredRate: 400,
      targetRate: 100,
      currentParam: atCompressiveBound,
      isEnabled: () => true,
    })

    // Assert — nada a mover: to == from seria atuacao vazia, entao zero atuacoes
    expect(acts.length).toBe(0)
  })

  it('AC3: simulacao de 10 ticks com ganho default converge (erro final < erro inicial / 2) sem oscilar', () => {
    // Arrange — planta deterministica: compressao reduz o consumo proporcionalmente
    // ao avanco medio dos knobs em direcao ao bound compressivo (0 = neutro, 1 = maximo).
    const target = 100
    const base = 200
    const params = new Map<string, number>()
    for (const k of GOVERNOR_KNOBS) {
      params.set(`${k.lever}:${k.param}`, k.direction === 1 ? k.min : k.max)
    }
    const aggressiveness = (): number => {
      let sum = 0
      for (const k of GOVERNOR_KNOBS) {
        const v = params.get(`${k.lever}:${k.param}`)!
        const progress = k.direction === 1 ? (v - k.min) / (k.max - k.min) : (k.max - v) / (k.max - k.min)
        sum += progress
      }
      return sum / GOVERNOR_KNOBS.length
    }

    const errors: number[] = []
    for (let tick = 0; tick < 10; tick += 1) {
      const measured = base * (1 - 0.5 * aggressiveness())
      errors.push((measured - target) / target)
      const acts: Actuation[] = governorTick({
        measuredRate: measured,
        targetRate: target,
        currentParam: (l, p) => params.get(`${l}:${p}`)!,
        isEnabled: () => true,
      })
      for (const a of acts) params.set(`${a.lever}:${a.param}`, a.to)
    }

    // Assert — convergencia
    expect(Math.abs(errors[errors.length - 1])).toBeLessThan(Math.abs(errors[0]) / 2)
    // Assert — sem oscilacao: nenhuma troca de sinal em 3 ticks consecutivos
    for (let i = 2; i < errors.length; i += 1) {
      const flips =
        Math.sign(errors[i]) !== Math.sign(errors[i - 1]) && Math.sign(errors[i - 1]) !== Math.sign(errors[i - 2])
      expect(flips).toBe(false)
    }
  })
})
