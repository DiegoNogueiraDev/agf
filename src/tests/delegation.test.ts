/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * D2 — guarda de delegação. Sem provider, os comandos --live devolvem um envelope
 * delegado (não quebram); --provider explícito conta como disponível (autônomo).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectAgfLlm, buildDelegatedEnvelope } from '../cli/shared/delegation.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

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
