/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Barra de progresso do `agf upgrade` (node_75475503f294). O renderer é PURO —
 * a animação real vai em stderr só em TTY (guardrail testado no upgrade-cmd E2E),
 * mas a montagem da barra é determinística e unit-testável aqui.
 */
import { describe, it, expect } from 'vitest'
import { renderProgressBar, createProgressWriter } from '../cli/shared/upgrade-progress.js'

/** Fake WriteStream capturando writes + isTTY controlável (DIP — zero mock de I/O real). */
function fakeStream(isTTY: boolean): NodeJS.WriteStream & { written: string[] } {
  const written: string[] = []
  const s = { isTTY, write: (chunk: string) => (written.push(String(chunk)), true), written }
  return s as unknown as NodeJS.WriteStream & { written: string[] }
}

describe('renderProgressBar (node_75475503f294)', () => {
  it('AC1: 60/100 em width 10 → contém "60%" e 6 de 10 blocos preenchidos', () => {
    const bar = renderProgressBar(60, 100, 10)
    expect(bar).toContain('60%')
    expect((bar.match(/█/g) ?? []).length).toBe(6)
    expect((bar.match(/░/g) ?? []).length).toBe(4)
  })

  it('AC2: total 0 (desconhecido) → não lança, sem NaN%', () => {
    const bar = renderProgressBar(0, 0, 10)
    expect(bar).not.toMatch(/NaN/)
    expect(() => renderProgressBar(1234, 0, 10)).not.toThrow()
  })

  it('100% → todos os blocos preenchidos', () => {
    const bar = renderProgressBar(100, 100, 10)
    expect((bar.match(/█/g) ?? []).length).toBe(10)
    expect(bar).toContain('100%')
  })

  it('clampa acima de 100% (downloaded > total) → 100%, sem estourar a largura', () => {
    const bar = renderProgressBar(150, 100, 10)
    expect((bar.match(/█/g) ?? []).length).toBe(10)
    expect(bar).toContain('100%')
  })
})

describe('createProgressWriter — guardrails de stderr/TTY (node_75475503f294)', () => {
  it('AC3: escreve a barra no stream injetado (stderr), não em stdout', () => {
    const err = fakeStream(true)
    const w = createProgressWriter(err)
    w.update(50, 100)
    w.done()
    expect(err.written.join('')).toContain('50%')
    expect(err.written.at(-1)).toBe('\n')
  })

  it('AC4: stream não-TTY (pipe/CI) → nenhum write (sem ANSI vazando p/ logs)', () => {
    const err = fakeStream(false)
    const w = createProgressWriter(err)
    w.update(50, 100)
    w.done()
    expect(err.written).toEqual([])
  })
})
