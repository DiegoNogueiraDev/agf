/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/designer/adr-challenge-runner.ts — wires decision-principles.ts
 * (node_wire_0d11737599cb) into the ADR challenge findings so principle violations
 * (e.g. "prefer-reversible") surface in the report, not just pre-mortem findings.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { runAdrChallenge } from '../core/designer/adr-challenge-runner.js'

describe('runAdrChallenge — decision-principles findings', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('includes a "principle" finding when the decision violates prefer-reversible', () => {
    const now = new Date().toISOString()
    store.insertNode({
      id: 'd1',
      type: 'decision' as never,
      title: 'Lock-in decision',
      description: 'This introduces a permanent vendor lock-in with an irreversible schema migration.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })

    const result = runAdrChallenge(store, 'd1')
    const principleFindings = result.report.preMortemFindings.filter((f) => f.source === 'principle')

    expect(principleFindings.length).toBeGreaterThan(0)
    expect(
      principleFindings.some((f) => f.message.includes('prefer-reversible') || f.dimension === 'reversibility'),
    ).toBe(true)
  })

  it('has no principle findings for a clean decision description', () => {
    const now = new Date().toISOString()
    store.insertNode({
      id: 'd2',
      type: 'decision' as never,
      title: 'Clean decision',
      description: 'A straightforward, well-scoped decision that works out of the box.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })

    const result = runAdrChallenge(store, 'd2')
    const principleFindings = result.report.preMortemFindings.filter((f) => f.source === 'principle')
    expect(principleFindings).toEqual([])
  })
})

describe('runAdrChallenge — jtbd extraction/scoring wired to jtbd-runner.ts (node_wire_7fb752a23756)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('extracts a JTBD from an epic and scores a matching decision as PASS', () => {
    const now = new Date().toISOString()
    store.insertNode({
      id: 'e1',
      type: 'epic' as never,
      title: 'Onboarding',
      description: 'When a new user signs up, I want a guided setup wizard, so I can start using the product quickly.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'M',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })
    store.insertNode({
      id: 'd3',
      type: 'decision' as never,
      title: 'Guided setup wizard decision',
      description: 'Build a guided setup wizard so new users can start using the product quickly after signup.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })

    const result = runAdrChallenge(store, 'd3')
    expect(result.report.jtbdResults.length).toBeGreaterThan(0)
    expect(result.report.jtbdResults[0].result).toBe('PASS')
    expect(typeof result.report.jtbdResults[0].jtbd).toBe('string')
  })
})

describe('runAdrChallenge — premortem wired to premortem-generator.ts (node_wire_b9eed8903268)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('detects a security-category failure mode from the richer template set', () => {
    const now = new Date().toISOString()
    store.insertNode({
      id: 'd4',
      type: 'decision' as never,
      title: 'Auth token decision',
      description: 'Adopt a new authentication token scheme for session management across services.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })

    const result = runAdrChallenge(store, 'd4')
    const premortemFindings = result.report.preMortemFindings.filter((f) => f.source === 'premortem')

    expect(premortemFindings.length).toBeGreaterThanOrEqual(3)
    expect(premortemFindings.some((f) => f.message.toLowerCase().includes('auth'))).toBe(true)
  })

  it('flags a constraint conflict when an edge links the decision to a violated constraint', () => {
    const now = new Date().toISOString()
    store.insertNode({
      id: 'c1',
      type: 'constraint' as never,
      title: 'No vendor lock-in',
      description: 'The system must not depend on proprietary vendor tooling.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })
    store.insertNode({
      id: 'd5',
      type: 'decision' as never,
      title: 'Vendor tooling decision',
      description: 'Adopt proprietary vendor tooling for the build pipeline.',
      status: 'backlog' as never,
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })
    store.insertEdge({ id: 'edge1', from: 'd5', to: 'c1', relationType: 'related_to' as never, createdAt: now })

    const result = runAdrChallenge(store, 'd5')
    const constraintFindings = result.report.preMortemFindings.filter((f) =>
      f.message.toLowerCase().includes('constraint'),
    )
    expect(constraintFindings.length).toBeGreaterThan(0)
  })
})
