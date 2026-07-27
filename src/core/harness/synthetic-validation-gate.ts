/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphDocument } from '../graph/graph-types.js'
import { checkInvariants, getBuiltInInvariants } from './property-invariants.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'synthetic-validation-gate.ts' })

export interface MutationRecord {
  type: 'dangling_edge' | 'status_regression' | 'self_cycle' | 'duplicate_edge'
  description: string
  detected: boolean
}
export interface SyntheticValidationResult {
  passed: boolean
  mutationsApplied: number
  mutationsCaught: number
  score: number
  mutations: MutationRecord[]
  durationMs: number
}

/** runSyntheticValidation —  */
export function runSyntheticValidation(store: SqliteStore): SyntheticValidationResult {
  const start = performance.now()
  const doc = store.toGraphDocument()
  if (doc.nodes.length === 0) {
    return {
      passed: true,
      mutationsApplied: 0,
      mutationsCaught: 0,
      score: 100,
      mutations: [],
      durationMs: Math.round(performance.now() - start),
    }
  }

  const mutations: MutationRecord[] = []
  const invariants = getBuiltInInvariants()

  if (doc.nodes.length > 0) {
    const mutated = cloneDoc(doc)
    mutated.edges.push({
      id: 'mut_dangling',
      from: doc.nodes[0].id,
      to: 'nonexistent_mutation_target',
      relationType: 'depends_on',
      createdAt: new Date().toISOString(),
    })
    const rVar = checkInvariants(mutated, invariants)
    mutations.push({ type: 'dangling_edge', description: 'Added edge to nonexistent node', detected: !rVar.passed })
  }

  if (doc.nodes.some((n) => n.status === 'done')) {
    const mutated = cloneDoc(doc)
    const doneNode = mutated.nodes.find((n) => n.status === 'done')
    if (doneNode) {
      doneNode.status = 'backlog'
      doneNode.metadata = { ...doneNode.metadata, previousStatus: 'done' }
      const rVar = checkInvariants(mutated, invariants)
      mutations.push({
        type: 'status_regression',
        description: 'Regressed node from done to backlog',
        detected: !rVar.passed,
      })
    }
  }

  if (doc.nodes.length > 0) {
    const mutated = cloneDoc(doc)
    const tVar = mutated.nodes[0]
    mutated.edges.push({
      id: 'mut_self_cycle',
      from: tVar.id,
      to: tVar.id,
      relationType: 'depends_on',
      createdAt: new Date().toISOString(),
    })
    const rVar = checkInvariants(mutated, invariants)
    mutations.push({ type: 'self_cycle', description: 'Added self-dependency', detected: !rVar.passed })
  }

  const caught = mutations.filter((m) => m.detected).length
  const total = mutations.length
  const score = total > 0 ? Math.round((caught / total) * 100) : 100
  const durationMs = Math.round(performance.now() - start)
  log.info('synthetic-validation:result', { mutationsApplied: total, mutationsCaught: caught, score, durationMs })
  return { passed: score >= 50, mutationsApplied: total, mutationsCaught: caught, score, mutations, durationMs }
}

function cloneDoc(doc: GraphDocument): GraphDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({ ...n, metadata: { ...n.metadata } })),
    edges: doc.edges.map((e) => ({ ...e })),
  }
}
