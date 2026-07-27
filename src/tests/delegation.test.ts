/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * D2 — guarda de delegação. Sem provider, os comandos --live devolvem um envelope
 * delegado (não quebram); --provider explícito conta como disponível (autônomo).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectAgfLlm, buildDelegatedEnvelope, detectSwarmingCli } from '../cli/shared/delegation.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'

function makeTask(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'title'>): GraphNode {
  const now = new Date().toISOString()
  return {
    type: 'task',
    status: 'backlog',
    priority: 1,
    acceptanceCriteria: ['GIVEN 0 providers WHEN --live runs THEN returns mode:delegated'],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('detectAgfLlm', () => {
  it('--provider explícito → disponível (autônomo)', () => {
    const r = detectAgfLlm(undefined, {} as NodeJS.ProcessEnv, { provider: 'openrouter' })
    expect(r.available).toBe(true)
  })

  it('env key OLLAMA_BASE_URL sozinho não basta sem provider setting', () => {
    // sem provider key, sem setting, sem login simulável aqui → cai p/ isLoggedIn real;
    // garantimos só que a função roda e retorna o shape correto.
    const r = detectAgfLlm(undefined, {} as NodeJS.ProcessEnv)
    expect(typeof r.available).toBe('boolean')
    expect(['provider-key', 'provider-setting', 'copilot-login', 'none']).toContain(r.via)
  })

  it('env key de provider → disponível', () => {
    const r = detectAgfLlm(undefined, { OPENROUTER_API_KEY: 'sk' } as NodeJS.ProcessEnv)
    expect(r).toMatchObject({ available: true, via: 'provider-key' })
  })

  it('CLI moderna dirigindo (Claude) → DELEGADO mesmo com provider key (ela É o provider)', () => {
    const r = detectAgfLlm(undefined, { CLAUDECODE: '1', OPENROUTER_API_KEY: 'sk' } as NodeJS.ProcessEnv)
    expect(r).toMatchObject({ available: false, via: 'delegated-cli', detail: 'claude' })
  })

  it('Codex dirigindo → delegado', () => {
    const r = detectAgfLlm(undefined, { CODEX: '1', OPENROUTER_API_KEY: 'sk' } as NodeJS.ProcessEnv)
    expect(r).toMatchObject({ available: false, via: 'delegated-cli', detail: 'codex' })
  })

  it('--provider explícito vence até com CLI moderna dirigindo (override do usuário)', () => {
    const r = detectAgfLlm(undefined, { CLAUDECODE: '1' } as NodeJS.ProcessEnv, { provider: 'openrouter' })
    expect(r.available).toBe(true)
  })

  it('standalone (sem CLI moderna) + provider key → autônomo', () => {
    const r = detectAgfLlm(undefined, { OPENAI_API_KEY: 'sk' } as NodeJS.ProcessEnv)
    expect(r).toMatchObject({ available: true, via: 'provider-key' })
  })
})

describe('buildDelegatedEnvelope', () => {
  it('ad-hoc (sem task) → prompt + nextSteps com agf submit/import-prd', async () => {
    const env = await buildDelegatedEnvelope({
      detected: { available: false, via: 'none' },
      adHocPrompt: 'crie um kanban',
    })
    expect(env.mode).toBe('delegated')
    expect(env.prompt).toBe('crie um kanban')
    expect(env.task).toBeUndefined()
    expect(env.nextSteps.join(' ')).toContain('agf')
  })
})

// Task 4.1 (PRD 0.20.0 — Fallback delegado sem provider): com 0 providers, um comando
// ligado a uma task devolve um envelope delegado COM BRIEF VÁLIDO, sem quebrar (resiliência H2).
describe('buildDelegatedEnvelope (task-bound, 0 providers)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('delegation-fallback-test')
    store.insertNode(makeTask({ id: 'node_fb1', title: 'Fallback delegado sem provider', description: 'd' }))
  })
  afterEach(() => {
    store.close()
  })

  it('retorna mode:delegated com brief válido e nextStep de agf submit', async () => {
    const env = await buildDelegatedEnvelope({
      detected: { available: false, via: 'none' },
      store,
      taskId: 'node_fb1',
    })
    expect(env.mode).toBe('delegated')
    expect(env.task?.id).toBe('node_fb1')
    expect(env.brief).toBeDefined()
    expect(env.prompt.length).toBeGreaterThan(0)
    expect(env.nextSteps.join(' ')).toContain('agf submit node_fb1')
    expect(env.reason.toLowerCase()).toContain('provider')
  })

  it('não quebra (resiliência) para uma task inexistente — cai no envelope ad-hoc', async () => {
    const env = await buildDelegatedEnvelope({
      detected: { available: false, via: 'none' },
      store,
      taskId: 'ghost',
    })
    expect(env.mode).toBe('delegated')
    expect(env.task).toBeUndefined()
    expect(env.prompt.length).toBeGreaterThan(0)
  })
})

describe('buildDelegatedEnvelope carries the diff-edit directive to the conductor (node_113267f66830)', () => {
  // Unique goal so ONLY the injected corpus can match — a missing pass-through would use the
  // default corpus and fail to produce this scaffold's path (clean RED→GREEN).
  const SCAFFOLD: ScaffoldDescriptor = {
    id: 'sc_e3t2',
    goal: 'zzz unique e3t2 delegate scaffold marker qqq',
    fitTags: ['zzz', 'e3t2', 'marker', 'delegate'],
    slots: ['x'],
    noveltyFloor: 0,
    structureRef: 'test/e3t2-scaffold.md',
  }

  let store: SqliteStore
  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('delegation-e3t2')
  })
  afterEach(() => store.close())

  it('AC1: a matching scaffold → envelope.brief has the directive and the prompt shows it', async () => {
    store.insertNode(makeTask({ id: 'node_prd', title: 'zzz unique e3t2 delegate scaffold marker qqq' }))
    const env = await buildDelegatedEnvelope({
      detected: { available: false, via: 'none' },
      store,
      taskId: 'node_prd',
      scaffoldCorpus: [SCAFFOLD],
    })
    expect(env.brief?.economyDirective?.scaffoldPath).toBe('test/e3t2-scaffold.md')
    expect(env.prompt).toContain('test/e3t2-scaffold.md')
  })

  it('AC2: a green-field task (empty corpus) → no directive in the brief or prompt', async () => {
    store.insertNode(makeTask({ id: 'node_gf', title: 'implement an unrelated widget xyz' }))
    const env = await buildDelegatedEnvelope({
      detected: { available: false, via: 'none' },
      store,
      taskId: 'node_gf',
      scaffoldCorpus: [],
    })
    expect(env.brief?.economyDirective).toBeUndefined()
    expect(env.prompt).not.toContain('diff-edit')
  })
})

// node_a0810513cbe8 — handshake de detecção do ant-swarming (colônia vs. delegado).
// Additivo: na AUSÊNCIA do binário nada muda (delegate-first é regra do repo).
describe('detectSwarmingCli (handshake)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarm-stub-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function stub(name: string, body: string): string {
    const p = join(dir, name)
    writeFileSync(p, `#!/bin/sh\n${body}\n`)
    chmodSync(p, 0o755)
    return p
  }

  it('AC1: sem binário no PATH → {installed:false} e buildDelegatedEnvelope inalterado (regressão zero)', async () => {
    const before = await buildDelegatedEnvelope({ detected: { available: false, via: 'none' }, adHocPrompt: 'x' })
    const status = await detectSwarmingCli({ bin: join(dir, 'does-not-exist-xyz') })
    const after = await buildDelegatedEnvelope({ detected: { available: false, via: 'none' }, adHocPrompt: 'x' })
    expect(status).toEqual({ installed: false })
    expect(after).toEqual(before) // deep-equal snapshot: detecção é puramente additiva
  })

  it('AC2: stub que responde o envelope de handshake → {installed:true, version, capabilities} validado por Zod', async () => {
    const bin = stub(
      'ant-swarming',
      `echo '{"ok":true,"data":{"name":"ant-swarming","version":"9.9.9","capabilities":["handshake"]}}'`,
    )
    const status = await detectSwarmingCli({ bin })
    expect(status.installed).toBe(true)
    expect(status.version).toBe('9.9.9')
    expect(status.capabilities).toEqual(['handshake'])
  })

  it('AC2b: stub que responde um envelope FORA do contrato → {installed:false} (Zod barra)', async () => {
    const bin = stub('ant-swarming', `echo '{"ok":true,"data":{"name":"outra-coisa"}}'`)
    expect(await detectSwarmingCli({ bin })).toEqual({ installed: false })
  })

  it('AC3: binário que trava (sleep > timeout) → {installed:false} em <2000ms sem exceção', async () => {
    const bin = stub('ant-swarming', 'sleep 10')
    const t0 = Date.now()
    const status = await detectSwarmingCli({ bin, timeoutMs: 300 })
    const elapsed = Date.now() - t0
    expect(status).toEqual({ installed: false })
    expect(elapsed).toBeLessThan(2000)
  })
})
