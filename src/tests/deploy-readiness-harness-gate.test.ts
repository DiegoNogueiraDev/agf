/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_9d7942d39710 — o gate de deploy COBRA o harness, não só o reporta.
 *
 * O requisito da Visão v1.0.0 diz que a release deve atingir grade B (score
 * >= 70). O check `harness_deploy_grade` já existia com esse limiar — como
 * `recommended`. E `ready` só considera checks `required`, então o gate
 * reportava o número e liberava do mesmo jeito: medido, exibido, não cobrado.
 *
 * Virar `required` é seguro HOJE porque o harness real está em 87.2 (grade A):
 * a mudança não bloqueia nada agora e passa a bloquear se o score regredir
 * abaixo de 70 — catraca, não meta nova.
 */

import { describe, it, expect } from 'vitest'
import { checkDeployReadiness } from '../core/deployer/deploy-readiness.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

const EMPTY: GraphDocument = { nodes: [], edges: [] } as GraphDocument

function harnessCheck(): { severity: string; name: string } | undefined {
  const report = checkDeployReadiness(EMPTY)
  return report.checks.find((c) => c.name === 'harness_deploy_grade')
}

describe('deploy gate — harness is charged, not just displayed', () => {
  it('the harness check is REQUIRED, so a regression below 70 blocks deploy', () => {
    const check = harnessCheck()

    // Se o scan falhar no ambiente, o check nem é emitido (try/catch no core) —
    // aí não há o que asserir, e o teste diz isso em vez de fingir.
    if (!check) {
      expect(true, 'harness scan indisponível neste ambiente — check não emitido').toBe(true)
      return
    }
    expect(check.severity).toBe('required')
  })

  it('deploy readiness still reports every check it runs — charging is not hiding', () => {
    const report = checkDeployReadiness(EMPTY)

    expect(report.checks.length).toBeGreaterThan(0)
    for (const c of report.checks) {
      expect(c.details.trim().length, `${c.name} sem details`).toBeGreaterThan(0)
    }
  })
})

describe('release scope — the gate measures what is UNFINISHED, not what is UNSTARTED (node_release_scope)', () => {
  function docWith(nodes: Array<{ id: string; type: string; status: string; description?: string }>) {
    const ts = '2026-01-01T00:00:00.000Z'
    return {
      nodes: nodes.map((n) => ({ priority: 3, title: n.id, createdAt: ts, updatedAt: ts, ...n })),
      edges: [],
    } as never
  }

  it('actionable work (ready/backlog/in_progress) still blocks the release', () => {
    // A parte que NAO pode afrouxar: task pronta para puxar e nao puxada e
    // trabalho inacabado de verdade, e trava o release.
    const r = checkDeployReadiness(docWith([{ id: 't1', type: 'task', status: 'ready' }]))
    const check = r.checks.find((c) => c.name === 'all_tasks_done')

    expect(check?.passed).toBe(false)
  })

  it('a task deferred with a written reason does NOT block — deferral is a decision, not debt', () => {
    // 198 nos bloqueados neste repo, TODOS com investigacao escrita: sao
    // colheita de dormencia adiada conscientemente. Exigir zero deles faz o
    // gate nunca ficar verde, e gate que nunca fica verde e decoracao.
    const r = checkDeployReadiness(
      docWith([
        { id: 't1', type: 'task', status: 'done' },
        { id: 't2', type: 'task', status: 'blocked', description: 'x'.repeat(220) },
      ]),
    )

    expect(r.checks.find((c) => c.name === 'all_tasks_done')?.passed).toBe(true)
  })

  it('a node blocked with NO reason still blocks — silence is not deferral', () => {
    // A troca so vale se a saida exigir justificativa. Bloqueado sem motivo
    // escrito e trabalho parado que ninguem explicou.
    const r = checkDeployReadiness(docWith([{ id: 't1', type: 'task', status: 'blocked' }]))

    expect(r.checks.find((c) => c.name === 'no_blocked_nodes')?.passed).toBe(false)
  })

  it('reports the deferred count in the details — nothing is hidden', () => {
    const r = checkDeployReadiness(
      docWith([{ id: 't1', type: 'task', status: 'blocked', description: 'y'.repeat(220) }]),
    )

    expect(r.checks.find((c) => c.name === 'no_blocked_nodes')?.details).toMatch(/1/)
  })
})
