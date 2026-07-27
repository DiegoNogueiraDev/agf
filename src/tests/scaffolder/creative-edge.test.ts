/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { creativeGate, generateCreativeFiles } from '../../core/scaffolder/creative-edge.js'
import { coupleNode } from '../../core/scaffolder/couple.js'
import { resolveReuse } from '../../core/reuse/resolve-reuse.js'

// Gerador FAKE (determinístico) — substitui a LLM nos testes. 0 modelo real.
const fakeGen = async (): Promise<string> =>
  '```json\n{ "files": [{ "path": "src/generated/novel.ts", "content": "export const novel = 42\\n" }] }\n```'

describe('creative-edge — gate por λ_flow + geração + promoção', () => {
  let store: SqliteStore
  let dir: string

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('p')
    dir = mkdtempSync(join(tmpdir(), 'agf-creative-'))
    delete process.env.AGF_CREATIVE
  })
  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGF_CREATIVE
  })

  it('gate: permite explorar com fluxo baixo, nega quando saturado/desligado', () => {
    expect(creativeGate(store).allowed).toBe(true) // φ=0 → λ=0.15 < 0.6
    store.setProjectSetting('flow_phi', '1') // λ=0.15+1.5=1.65 ≥ 0.6 → conserva
    expect(creativeGate(store).allowed).toBe(false)
    store.setProjectSetting('flow_phi', '0')
    process.env.AGF_CREATIVE = '0'
    expect(creativeGate(store).allowed).toBe(false)
  })

  it('generateCreativeFiles valida por parse (lixo → [])', async () => {
    expect((await generateCreativeFiles({ title: 'x' }, [], fakeGen)).length).toBe(1)
    expect((await generateCreativeFiles({ title: 'x' }, [], async () => 'sem json')).length).toBe(0)
  })

  it('node sem spec + gerador → gera, escreve e PROMOVE (reuso exact na próxima)', async () => {
    const node = { id: 'nv', title: 'Algo totalmente novo', metadata: {} }
    const r = await coupleNode(store, node, { apply: true, workspaceDir: dir, creative: fakeGen })
    expect(r.applied).toBe(true)
    expect(r.kinds).toContain('creative')
    expect(existsSync(join(dir, 'src/generated/novel.ts'))).toBe(true)
    // promovido: próxima vez é determinístico (exact), 0 token
    expect(resolveReuse(store.getDb(), 'scf_nv_creative').kind).toBe('exact')
  })

  it('sem gerador injetado → 0 LLM (node sem spec é skipped)', async () => {
    const r = await coupleNode(store, { id: 'n0', title: 'x', metadata: {} }, { apply: true, workspaceDir: dir })
    expect(r.skipped).toBe(true)
    expect(r.reason).toBe('needs-llm')
  })

  it('validação: testes passam → promove a semente', async () => {
    const node = { id: 'ok', title: 'novo', metadata: {} }
    const r = await coupleNode(store, node, {
      apply: true,
      workspaceDir: dir,
      creative: fakeGen,
      validate: async () => ({ passed: true }),
    })
    expect(r.validated).toBe(true)
    expect(r.applied).toBe(true)
    expect(resolveReuse(store.getDb(), 'scf_ok_creative').kind).toBe('exact')
  })

  it('seleção natural: testes falham → reverte e NÃO promove', async () => {
    const node = { id: 'bad', title: 'novo ruim', metadata: {} }
    const r = await coupleNode(store, node, {
      apply: true,
      workspaceDir: dir,
      creative: fakeGen,
      validate: async () => ({ passed: false }),
    })
    expect(r.validated).toBe(false)
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('creative-failed-validation')
    // arquivo revertido + não promovido (corpus limpo)
    expect(existsSync(join(dir, 'src/generated/novel.ts'))).toBe(false)
    expect(resolveReuse(store.getDb(), 'scf_bad_creative').kind).toBe('none')
  })
})
