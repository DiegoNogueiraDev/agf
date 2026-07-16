/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// node_5c8bbec46123 — amortizar na ESCRITA (playbook mem0): dedupe NCD + salience
// uma vez na gravação; a leitura nunca recomputa. Contador de chamadas ao ncd()
// prova o amortize: >0 na escrita com lever, 0 em qualquer leitura.
const ncdCalls = { count: 0 }
vi.mock('../core/economy/ncd-dedup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/economy/ncd-dedup.js')>()
  return {
    ...actual,
    ncd: (a: string, b: string): number => {
      ncdCalls.count += 1
      return actual.ncd(a, b)
    },
  }
})

const { writeMemory, readMemory, listMemories, readAllMemories, amortizeFromLevers } =
  await import('../core/memory/memory-reader.js')

const LONG =
  'licao durável do ciclo de build: o gate de done lê a working tree e recusa árvore limpa; ' +
  'commit vem depois do done, nunca antes; declarar implementationFiles no claim. '.repeat(4)

describe('writeMemory — amortizar na escrita (dedupe NCD + salience)', () => {
  let base: string

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'agf-mem-amortize-'))
    ncdCalls.count = 0
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('AC1: lever ON + NCD similar a existente ⇒ funde (contagem não cresce) e registra a fusão', async () => {
    await writeMemory(base, 'm1', LONG)
    const result = await writeMemory(base, 'm2', `${LONG} detalhe novo do segundo ciclo`, {
      amortize: { dedupeThreshold: 0.3 },
    })

    expect(result.outcome).toBe('fused')
    expect(result.fusedInto).toBe('m1')
    expect(await listMemories(base)).toEqual(['m1']) // não cresceu
    const fused = await readMemory(base, 'm1')
    expect(fused!.content).toContain('detalhe novo do segundo ciclo') // fusão preservou o delta
  })

  it('AC2: sem lever ⇒ caminho byte-idêntico ao atual (duplicata criada como hoje)', async () => {
    await writeMemory(base, 'm1', LONG)
    const result = await writeMemory(base, 'm2', LONG)

    expect(result.outcome).toBe('written')
    expect((await listMemories(base)).sort()).toEqual(['m1', 'm2'])
    const raw = readFileSync(join(base, 'workflow-graph', 'memories', 'm2.md'), 'utf-8')
    expect(raw).toBe(LONG) // byte-idêntico: nenhum frontmatter/transformação
  })

  it('AC3: leitura pós-fusão NÃO recomputa dedupe (contador de ncd = 0)', async () => {
    await writeMemory(base, 'm1', LONG)
    await writeMemory(base, 'm2', `${LONG} outro delta`, { amortize: { dedupeThreshold: 0.3 } })
    expect(ncdCalls.count).toBeGreaterThan(0) // pagou na escrita

    ncdCalls.count = 0
    await readMemory(base, 'm1')
    await readAllMemories(base)
    await listMemories(base)
    expect(ncdCalls.count).toBe(0) // leitura amortizada: zero recomputo
  })

  it('conteúdo dissimilar não funde mesmo com lever ON', async () => {
    await writeMemory(base, 'm1', LONG)
    const result = await writeMemory(base, 'm2', 'fato completamente diferente sobre deploy de binários no CDN', {
      amortize: { dedupeThreshold: 0.3 },
    })

    expect(result.outcome).toBe('written')
    expect((await listMemories(base)).sort()).toEqual(['m1', 'm2'])
  })

  it('salience inicial gravada no frontmatter quando stampSalience (lida, não recomputada)', async () => {
    await writeMemory(base, 'm1', LONG, { amortize: { stampSalience: true } })

    const raw = readFileSync(join(base, 'workflow-graph', 'memories', 'm1.md'), 'utf-8')
    expect(raw).toContain('salience: 1')
    const mem = await readMemory(base, 'm1')
    expect(mem!.content).toBe(LONG) // frontmatter não vaza pro content
  })
})

describe('amortizeFromLevers — mapper puro lever → opções de amortize', () => {
  it('tudo OFF ⇒ undefined (caminho byte-idêntico)', () => {
    expect(amortizeFromLevers({})).toBeUndefined()
  })

  it('ncd_dedup ON ⇒ dedupeThreshold do param (default 0.3)', () => {
    expect(amortizeFromLevers({ ncd_dedup: { enabled: true } })).toEqual({ dedupeThreshold: 0.3 })
    expect(amortizeFromLevers({ ncd_dedup: { enabled: true, params: { threshold: 0.5 } } })).toEqual({
      dedupeThreshold: 0.5,
    })
  })

  it('memory_salience ON ⇒ stampSalience', () => {
    expect(amortizeFromLevers({ memory_salience: { enabled: true } })).toEqual({ stampSalience: true })
  })
})
