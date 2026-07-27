/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * E2E da colônia same-worktree (node_3812f5ac5b29) — a PROVA do Key Result do
 * épico node_ae3e658836b8: 2 formigas no MESMO grafo e (simuladamente) na mesma
 * árvore completam o ciclo claim → in_progress(dono) → gates de done sem
 * hijack e sem falso BLAST_RADIUS. Integra as três entregas must:
 * anti-hijack por claimedBy (node_bfd8fa7d664d), fronteira de arquivos em voo
 * (node_a268188b9c2e) e gate multi-formiga (node_58932e8189fc).
 * 0 token de LLM, 0 rede, 0 git real — :memory: + funções core dos gates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { LockManager } from '../core/store/lock-manager.js'
import { claimNextTask } from '../core/planner/claim-next-task.js'
import {
  detectScopeCreep,
  collectForeignInFlightFiles,
  DEFAULT_SCOPE_ALLOWLIST,
} from '../core/gaps/detect-scope-creep.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const FORMIGA_A = 'formiga-a'
const FORMIGA_B = 'formiga-b'

function colonyTask(
  id: string,
  priority: number,
  files: { impl?: string[]; test?: string[] },
  status = 'backlog',
  claimedBy?: string,
): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...(files.impl ? { implementationFiles: files.impl } : {}),
    ...(files.test ? { testFiles: files.test } : {}),
    ...(claimedBy ? { metadata: { claimedBy } } : {}),
  } as GraphNode
}

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'colony', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('colônia same-worktree — 2 formigas, 1 grafo, zero interferência (KR node_ae3e658836b8)', () => {
  let db: Database.Database
  let locks: LockManager

  beforeEach(() => {
    db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    locks = new LockManager(db)
  })

  afterEach(() => db.close())

  it('AC1: 2 agentes com ids distintos fazem claim e recebem tasks DIFERENTES', () => {
    const doc = makeDoc([
      colonyTask('ta', 1, { impl: ['src/a.ts'], test: ['src/tests/a.test.ts'] }),
      colonyTask('tb', 2, { impl: ['src/b.ts'], test: ['src/tests/b.test.ts'] }),
    ])

    const a = claimNextTask(doc, locks, FORMIGA_A)
    const b = claimNextTask(doc, locks, FORMIGA_B)

    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.node.id).not.toBe(b!.node.id)
    expect(a!.claim.agentId).toBe(FORMIGA_A)
    expect(b!.claim.agentId).toBe(FORMIGA_B)
  })

  it('AC2: 0 hijacks em 10 tentativas — a task in_progress com dono nunca é entregue à outra formiga', () => {
    // Task de A já em voo (dona registrada) — MESMO sem lease viva (expirada).
    const doc = makeDoc([
      colonyTask('minha-a', 1, { impl: ['src/a.ts'] }, 'in_progress', FORMIGA_A),
      colonyTask('livre', 2, { impl: ['src/b.ts'] }),
    ])

    for (let attempt = 0; attempt < 10; attempt++) {
      const pulled = claimNextTask(doc, locks, FORMIGA_B)
      // 'livre' é claimada na 1ª tentativa e re-entregue (idempotente) depois;
      // NUNCA 'minha-a'.
      expect(pulled?.node.id).not.toBe('minha-a')
    }
  })

  it('controle negativo (anchor): sem claimedBy, uma in_progress legada não protege por dono — só o filtro de status', () => {
    // Documenta a fronteira: a proteção anti-hijack vem do claimedBy; o node
    // legado sem dono depende apenas de in_progress não ser candidata de pull.
    const doc = makeDoc([
      colonyTask('legada', 1, { impl: ['src/a.ts'] }, 'in_progress'),
      colonyTask('livre', 2, { impl: ['src/b.ts'] }),
    ])
    const pulled = claimNextTask(doc, locks, FORMIGA_B)
    // in_progress nunca é candidata de claim (status), com ou sem dono.
    expect(pulled!.node.id).toBe('livre')
  })

  it('AC2b: fronteira de arquivos — candidata que colide com o voo alheio é pulada mesmo sem lease', () => {
    const doc = makeDoc([
      colonyTask('voo-a', 1, { impl: ['src/shared.ts'] }, 'in_progress', FORMIGA_A),
      colonyTask('colide', 1, { impl: ['src/shared.ts'] }),
      colonyTask('segura', 2, { impl: ['src/other.ts'] }),
    ])
    const b = claimNextTask(doc, locks, FORMIGA_B)
    expect(b!.node.id).toBe('segura')
  })

  it('AC3: árvore suja com arquivos declarados de AMBAS — nenhum done acusa o arquivo da outra; órfão é acusado', () => {
    const taskA = colonyTask('ta', 1, { impl: ['src/a.ts'], test: ['src/tests/a.test.ts'] }, 'in_progress', FORMIGA_A)
    const taskB = colonyTask('tb', 1, { impl: ['src/b.ts'], test: ['src/tests/b.test.ts'] }, 'in_progress', FORMIGA_B)
    const nodes = [taskA, taskB]

    // Árvore compartilhada: arquivos das duas formigas sujos ao mesmo tempo.
    const dirtyTree = ['src/a.ts', 'src/tests/a.test.ts', 'src/b.ts', 'src/tests/b.test.ts']

    // Gate do done de A: os arquivos de B são fronteira alheia, não creep.
    const foreignForA = collectForeignInFlightFiles(nodes, 'ta')
    const creepA = detectScopeCreep(
      dirtyTree,
      ['src/a.ts', 'src/tests/a.test.ts'],
      [...DEFAULT_SCOPE_ALLOWLIST, ...foreignForA],
    )
    expect(creepA).toEqual([])

    // Gate do done de B, simétrico.
    const foreignForB = collectForeignInFlightFiles(nodes, 'tb')
    const creepB = detectScopeCreep(
      dirtyTree,
      ['src/b.ts', 'src/tests/b.test.ts'],
      [...DEFAULT_SCOPE_ALLOWLIST, ...foreignForB],
    )
    expect(creepB).toEqual([])

    // Órfão injetado (nenhuma formiga declarou): AMBOS os gates acusam.
    const withOrphan = [...dirtyTree, 'src/orfao.ts']
    expect(
      detectScopeCreep(withOrphan, ['src/a.ts', 'src/tests/a.test.ts'], [...DEFAULT_SCOPE_ALLOWLIST, ...foreignForA]),
    ).toEqual(['src/orfao.ts'])
    expect(
      detectScopeCreep(withOrphan, ['src/b.ts', 'src/tests/b.test.ts'], [...DEFAULT_SCOPE_ALLOWLIST, ...foreignForB]),
    ).toEqual(['src/orfao.ts'])
  })

  it('ciclo completo: claim → in_progress(dono) → done libera a lease e a task some do pool', () => {
    const nodes = [colonyTask('ta', 1, { impl: ['src/a.ts'] }), colonyTask('tb', 2, { impl: ['src/b.ts'] })]
    const doc = makeDoc(nodes)

    const a = claimNextTask(doc, locks, FORMIGA_A)
    expect(a!.node.id).toBe('ta')

    // Simula o fluxo do builder: status + dono persistidos no node.
    nodes[0] = { ...nodes[0], status: 'in_progress', metadata: { claimedBy: FORMIGA_A } } as GraphNode
    const docInFlight = makeDoc(nodes)

    // B claim durante o voo de A → recebe tb.
    const b = claimNextTask(docInFlight, locks, FORMIGA_B)
    expect(b!.node.id).toBe('tb')

    // A fecha: done → release da lease + status done.
    locks.release(a!.claim.leaseToken)
    nodes[0] = { ...nodes[0], status: 'done' } as GraphNode

    // Nada de A permanece protegido: a fronteira de arquivos em voo esvazia.
    const foreign = collectForeignInFlightFiles(nodes, 'tb')
    expect(foreign).toEqual([])
  })
})

// node_9304ad729023 — KR2 do épico node_34ae3496ed44: ciclo de identidade
// COMPLETO com identidade apenas no env (sem flag): claim → in_progress+dono →
// done-path resolve identidade do env, libera a lease E limpa claimedBy →
// task reabrível por outra formiga. Integra node_ca455c0520fc (env identity),
// node_8af0904e42fa (strip ao sair de in_progress) e node_0c28154d4517
// (dono órfão não assombra).
describe('ciclo de identidade completo — claim env → done env → lease liberada + dono limpo (KR2)', () => {
  const originalEnv = process.env.AGF_AGENT_ID

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalEnv
  })

  it('AC1+AC2: done com identidade só no env ⇒ locks vazios + claimedBy ausente; formiga-b reabre sem --force', async () => {
    const { SqliteStore } = await import('../core/store/sqlite-store.js')
    const { releaseTaskClaim } = await import('../core/planner/release-task-claim.js')
    const { resolveReleaseAgentId } = await import('../core/planner/resolve-agent-id.js')

    const store = SqliteStore.open(':memory:')
    store.initProject('identity-cycle')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'tx',
      type: 'task',
      title: 'Task tx',
      status: 'backlog',
      priority: 1,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    const storeLocks = new LockManager(store.getDb())

    // 1. claim atômico como formiga-a (pull) — lease viva no formato task:<id>
    const claim = claimNextTask(store.toGraphDocument(), storeLocks, FORMIGA_A)
    expect(claim?.node.id).toBe('tx')
    expect(storeLocks.listActive().some((l) => l.resourceId === 'task:tx')).toBe(true)

    // 2. voo: in_progress + dono gravado (o que o claimante faz na sequência)
    store.updateNodeStatus('tx', 'in_progress')
    store.updateNode('tx', { metadata: { claimedBy: FORMIGA_A } })

    // 3. done-path com identidade APENAS no env (sem flag — paridade com o next)
    process.env.AGF_AGENT_ID = FORMIGA_A
    const releaseAgent = resolveReleaseAgentId(undefined, process.env.AGF_AGENT_ID)
    expect(releaseAgent).toBe(FORMIGA_A)
    const release = releaseTaskClaim(store.getDb(), 'tx', releaseAgent!)
    expect(release.mismatch).toBe(false)
    store.updateNodeStatus('tx', 'done')

    // AC1: os DOIS eixos limpos no mesmo teste
    expect(storeLocks.listActive().filter((l) => l.resourceId === 'task:tx')).toEqual([])
    const meta = store.getNodeById('tx')?.metadata as Record<string, unknown> | undefined
    expect(meta?.claimedBy).toBeUndefined()

    // AC2: reabertura por formiga-b sem --force (dono anterior não assombra)
    store.updateNodeStatus('tx', 'in_progress')
    store.updateNode('tx', { metadata: { claimedBy: FORMIGA_B } })
    const reopened = store.getNodeById('tx')
    expect(reopened?.status).toBe('in_progress')
    expect((reopened?.metadata as Record<string, unknown>)?.claimedBy).toBe(FORMIGA_B)

    store.close()
  })
})
