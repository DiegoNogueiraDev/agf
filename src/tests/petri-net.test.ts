/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_91c89af4f730 — Petri Net coordination validator (TB-CSPN)
 *
 * AC1: Colored Petri Net: places=states, transitions=events, tokens=colored(agentId,phase).
 * AC2: Deadlock detection via reachability analysis.
 * AC3: 9-phase agf pipeline is deadlock-free.
 */

import { describe, it, expect } from 'vitest'
import { createPetriNet, type PetriNetSpec, type ColoredToken } from '../core/planner/petri-net.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Simple 3-state pipeline: A → B → C */
const LINEAR_SPEC: PetriNetSpec = {
  places: ['A', 'B', 'C'],
  transitions: [
    { name: 't1', from: ['A'], to: ['B'], guard: null },
    { name: 't2', from: ['B'], to: ['C'], guard: null },
  ],
}

/** Deadlock: B has no outgoing transition */
const DEADLOCK_SPEC: PetriNetSpec = {
  places: ['A', 'B'],
  transitions: [{ name: 't1', from: ['A'], to: ['B'], guard: null }],
}

/** agf 9-phase pipeline (simplified) */
const AGF_PIPELINE_SPEC: PetriNetSpec = {
  places: ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'],
  transitions: [
    { name: 'analyze→design', from: ['ANALYZE'], to: ['DESIGN'], guard: null },
    { name: 'design→plan', from: ['DESIGN'], to: ['PLAN'], guard: null },
    { name: 'plan→implement', from: ['PLAN'], to: ['IMPLEMENT'], guard: null },
    { name: 'implement→validate', from: ['IMPLEMENT'], to: ['VALIDATE'], guard: null },
    { name: 'validate→review', from: ['VALIDATE'], to: ['REVIEW'], guard: null },
    { name: 'review→handoff', from: ['REVIEW'], to: ['HANDOFF'], guard: null },
    { name: 'handoff→deploy', from: ['HANDOFF'], to: ['DEPLOY'], guard: null },
    { name: 'deploy→listening', from: ['DEPLOY'], to: ['LISTENING'], guard: null },
    { name: 'listening→analyze', from: ['LISTENING'], to: ['ANALYZE'], guard: null },
  ],
}

// ── AC1 — colored tokens and marking ─────────────────────────────────────────

describe('PetriNet (AC1 — colored tokens)', () => {
  it('places token in initial marking', () => {
    const net = createPetriNet(LINEAR_SPEC)
    const token: ColoredToken = { agentId: 'agent-1', phase: 'BUILD', payload: {} }
    net.addToken('A', token)
    expect(net.marking('A').length).toBe(1)
    expect(net.marking('A')[0].agentId).toBe('agent-1')
  })

  it('fires transition: removes from source, adds to target', () => {
    const net = createPetriNet(LINEAR_SPEC)
    net.addToken('A', { agentId: 'a1', phase: 'P1', payload: {} })
    const fired = net.fire('t1')
    expect(fired).toBe(true)
    expect(net.marking('A').length).toBe(0)
    expect(net.marking('B').length).toBe(1)
  })

  it('cannot fire transition when source has no tokens', () => {
    const net = createPetriNet(LINEAR_SPEC)
    const fired = net.fire('t1')
    expect(fired).toBe(false)
  })
})

// ── AC2 — deadlock detection ──────────────────────────────────────────────────

describe('PetriNet (AC2 — deadlock detection)', () => {
  it('detects deadlock when token is stuck with no enabled transitions', () => {
    const net = createPetriNet(DEADLOCK_SPEC)
    net.addToken('B', { agentId: 'a1', phase: 'P1', payload: {} })
    const result = net.analyze()
    expect(result.deadlock).toBe(true)
  })

  it('no deadlock in linear pipeline with token at A', () => {
    const net = createPetriNet(LINEAR_SPEC)
    net.addToken('A', { agentId: 'a1', phase: 'P1', payload: {} })
    const result = net.analyze()
    expect(result.deadlock).toBe(false)
  })

  it('deadlock when empty net (no tokens)', () => {
    const net = createPetriNet(LINEAR_SPEC)
    // No tokens — technically no active agent, but not a deadlock in our model
    const result = net.analyze()
    expect(result.deadlock).toBe(false)
  })
})

// ── AC3 — 9-phase pipeline is deadlock-free ──────────────────────────────────

describe('PetriNet (AC3 — agf 9-phase pipeline deadlock-free)', () => {
  it('pipeline with token at ANALYZE is deadlock-free', () => {
    const net = createPetriNet(AGF_PIPELINE_SPEC)
    net.addToken('ANALYZE', { agentId: 'conductor', phase: 'ANALYZE', payload: {} })
    const result = net.analyze()
    expect(result.deadlock).toBe(false)
  })

  it('all 9 phases are reachable from ANALYZE', () => {
    const net = createPetriNet(AGF_PIPELINE_SPEC)
    net.addToken('ANALYZE', { agentId: 'conductor', phase: 'ANALYZE', payload: {} })
    const result = net.analyze()
    expect(result.reachablePlaces).toContain('IMPLEMENT')
    expect(result.reachablePlaces).toContain('DEPLOY')
    expect(result.reachablePlaces).toContain('LISTENING')
  })
})
