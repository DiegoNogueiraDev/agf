/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for `agf genesis <idea>` (node_wire_f2378d2c3f49) — wires the pure
 * runGenesis orchestrator (src/core/orchestrator/genesis.ts) to production
 * handlers. LLM step is mocked at the buildClientFromProject boundary (0
 * token — same pattern as genesis.test.ts's realHandlers, but exercised
 * through the real CLI command entrypoint).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { genesisCommand } from '../cli/commands/genesis-cmd.js'

const SAMPLE_PRD = readFileSync(join(process.cwd(), 'docs/examples/sample-prd.md'), 'utf8')

vi.mock('../cli/shared/provider-context.js', () => ({
  buildClientFromProject: () => ({
    client: {
      modelFor: () => 'fake-model',
      run: async () => ({
        text: SAMPLE_PRD,
        model: 'fake-model',
        tokensIn: 0,
        tokensOut: 0,
        cachedTokensIn: 0,
        reasoningTokens: 0,
        fromCache: false,
      }),
    },
    providerLabel: 'fake',
  }),
}))

interface Envelope {
  ok: boolean
  code?: string
  error?: string
  data?: {
    ok?: boolean
    failedStep?: string
    steps?: Array<{ name: string; ok: boolean }>
    imported?: { nodes: number; edges: number }
    firstBrief?: { task?: { id: string } } | null
  }
}

function lastEnvelope(captured: string[]): Envelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as Envelope
}

describe('genesis command', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-genesis-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runGenesisCmd(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await genesisCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('has the correct command name and a non-empty description', () => {
    const cmd = genesisCommand()
    expect(cmd.name()).toBe('genesis')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('ideia de 1 frase → grafo bootstrapped com PRD importado + primeiro brief', async () => {
    const env = await runGenesisCmd(['um CLI de lista de tarefas com add, list e concluir', '-d', dir])

    expect(env.ok).toBe(true)
    expect(env.data?.ok).toBe(true)
    expect(env.data?.failedStep).toBeUndefined()
    expect(env.data?.steps?.map((s) => s.name)).toEqual([
      'init',
      'generate_prd',
      'import_prd',
      'decompose',
      'gaps',
      'brief',
    ])
    expect(env.data?.steps?.every((s) => s.ok)).toBe(true)
    expect(env.data?.imported?.nodes).toBeGreaterThan(0)
    expect(env.data?.firstBrief?.task?.id).toBeTruthy()
  })

  it('etapa que falha → envelope ok:false com o failedStep honesto (nunca ok:true com falha interna)', async () => {
    // A dir sem parent gravável faz decompose's openStoreOrFail funcionar mas o
    // import_prd falha com uma ideia vazia (ValidationError em generatePrd).
    const env = await runGenesisCmd(['', '-d', dir])

    expect(env.ok).toBe(false)
    expect(env.code).toBe('GENESIS_FAILED')
    expect(env.data?.failedStep).toBe('generate_prd')
  })
})

// node_bcd488e481e4 — WIRE consumidor: genesis no help agrupado, no índice
// RAG-IN ("criar projeto do zero" → top-3) e flag --review que imprime o PRD
// e PARA antes do import (guarda humana contra PRD ruim; default em TTY).
describe('genesis — superfície do consumidor (help + RAG-IN + --review)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-genesis-wire-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runGenesisCmd(args: string[]): Promise<Envelope & { data?: { review?: boolean; prd?: string } }> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await genesisCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    return lastEnvelope(out) as Envelope & { data?: { review?: boolean; prd?: string } }
  }

  it('AC1: agf help lista genesis num grupo', async () => {
    const { helpCommand } = await import('../cli/commands/help-cmd.js')
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await helpCommand().parseAsync([], { from: 'user' })
    spy.mockRestore()
    expect(out.join('')).toContain('genesis')
  })

  it('AC2: retrieve-command "criar projeto do zero" tem genesis no top-3', async () => {
    const { retrieveCommand } = await import('../core/rag-in/retrieve.js')
    const { buildLiveCorpus } = await import('../core/rag-in/builtin-corpus.js')
    const { CLI_COMMANDS } = await import('../cli/commands-list.js')

    const r = retrieveCommand('criar projeto do zero', buildLiveCorpus(CLI_COMMANDS))
    const top3 = (r.candidates ?? []).slice(0, 3).map((c) => c.chunk.command)

    expect(top3).toContain('agf genesis')
  })

  it('AC3: --review imprime o PRD e para ANTES do import (nada importado)', async () => {
    const env = await runGenesisCmd(['um CLI de lista de tarefas', '--review', '-d', dir])

    expect(env.ok).toBe(true)
    expect(env.data?.review).toBe(true)
    expect(env.data?.prd).toContain('#') // o PRD gerado vai no envelope p/ aprovação
    const stepNames = (env.data?.steps ?? []).map((s) => s.name)
    expect(stepNames).not.toContain('import_prd') // parou antes do import
    expect(env.data?.imported).toBeUndefined()
  })

  it('sem --review (não-TTY) o fluxo completo segue até o brief (regressão zero)', async () => {
    const env = await runGenesisCmd(['um CLI de lista de tarefas', '-d', dir])

    expect(env.ok).toBe(true)
    expect((env.data?.steps ?? []).map((s) => s.name)).toContain('import_prd')
  })
})
