/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  initialState,
  transition,
  inState,
  sessionMachine,
  sessionGuards,
  type Machine,
} from '../core/session/session-statechart.js'

// ── A small hand-built machine exercising every Harel feature in isolation ──────
const toy: Machine = {
  id: 'toy',
  regions: {
    // orthogonal region 1 — flat with shallow history
    mode: {
      initial: 'a',
      history: true,
      states: {
        a: { on: { GO_B: { target: 'b' }, GO_C: { target: 'c' } } },
        b: { on: { GO_A: { target: 'a' } } },
        c: { on: { RESUME: { target: '$history' } } },
      },
    },
    // orthogonal region 2 — hierarchical (compound) + cross-level transition + guard
    work: {
      initial: 'idle',
      states: {
        idle: { on: { START: { target: 'active', guard: 'canStart' } } },
        active: {
          initial: 'step1',
          states: {
            step1: { on: { NEXT: { target: 'step2' } } },
            step2: { on: { DONE: { target: 'idle' } } }, // cross-level: target is a sibling of `active`
          },
        },
      },
    },
  },
}

const toyGuards = { canStart: (_ctx: unknown, e: { type: string }): boolean => e.type === 'START' }

describe('initialState', () => {
  it('descends each region to its initial leaf', () => {
    const s = initialState(toy)
    expect(s.value.mode).toEqual(['a'])
    expect(s.value.work).toEqual(['idle'])
  })
})

describe('initialState — hierarchical descent', () => {
  it('resolves a compound initial down to the leaf substate', () => {
    const s = initialState(toy)
    expect(s.value.work).toEqual(['idle']) // initial of work is the simple state `idle`
  })
})

describe('inState helper', () => {
  it('reports membership by region + state id at any depth', () => {
    const s = initialState(toy)
    expect(inState(s, 'mode', 'a')).toBe(true)
    expect(inState(s, 'mode', 'b')).toBe(false)
    expect(inState(s, 'work', 'idle')).toBe(true)
  })
})

describe('transition — flat within a region', () => {
  it('moves a → b on GO_B', () => {
    const s = transition(toy, initialState(toy), { type: 'GO_B' })
    expect(inState(s, 'mode', 'b')).toBe(true)
  })

  it('does not mutate the input state (immutability)', () => {
    const s0 = initialState(toy)
    const snapshot = JSON.stringify(s0)
    transition(toy, s0, { type: 'GO_B' })
    expect(JSON.stringify(s0)).toBe(snapshot)
  })

  it('returns an unchanged value when no region handles the event', () => {
    const s0 = initialState(toy)
    const s1 = transition(toy, s0, { type: 'NOPE' })
    expect(s1.value).toEqual(s0.value)
  })
})

describe('transition — orthogonal regions are independent', () => {
  it('an event handled by one region leaves the others untouched', () => {
    const s = transition(toy, initialState(toy), { type: 'GO_B' })
    expect(inState(s, 'mode', 'b')).toBe(true)
    expect(inState(s, 'work', 'idle')).toBe(true) // work region unaffected
  })
})

describe('transition — hierarchy (compound descent + cross-level)', () => {
  it('entering a compound state descends to its initial substate', () => {
    const s = transition(toy, initialState(toy), { type: 'START' }, { guards: toyGuards })
    expect(inState(s, 'work', 'active')).toBe(true)
    expect(inState(s, 'work', 'step1')).toBe(true)
    expect(s.value.work).toEqual(['active', 'step1'])
  })

  it('a deep substate can transition to a higher-scope sibling (cross-level)', () => {
    let s = transition(toy, initialState(toy), { type: 'START' }, { guards: toyGuards })
    s = transition(toy, s, { type: 'NEXT' }) // step1 → step2
    expect(inState(s, 'work', 'step2')).toBe(true)
    s = transition(toy, s, { type: 'DONE' }) // step2 → idle (sibling of `active`)
    expect(inState(s, 'work', 'idle')).toBe(true)
  })
})

describe('transition — guards', () => {
  it('blocks the transition when the guard returns false', () => {
    const denyGuards = { canStart: (): boolean => false }
    const s = transition(toy, initialState(toy), { type: 'START' }, { guards: denyGuards })
    expect(inState(s, 'work', 'idle')).toBe(true) // stayed put
  })

  it('allows the transition when the guard returns true', () => {
    const s = transition(toy, initialState(toy), { type: 'START' }, { guards: toyGuards })
    expect(inState(s, 'work', 'active')).toBe(true)
  })
})

describe('transition — history (resume without context loss)', () => {
  it('$history restores the region’s last active leaf', () => {
    let s = initialState(toy)
    s = transition(toy, s, { type: 'GO_B' }) // mode: a → b
    s = transition(toy, s, { type: 'GO_A' }) // mode: b → a
    s = transition(toy, s, { type: 'GO_C' }) // mode: a → c  (history records `a`)
    expect(inState(s, 'mode', 'c')).toBe(true)
    s = transition(toy, s, { type: 'RESUME' }) // c → $history → restores `a`
    expect(inState(s, 'mode', 'a')).toBe(true)
  })
})

// ── The concrete session machine the harness.session layer runs on ──────────────
describe('sessionMachine — formal model of harness.session', () => {
  it('has the three orthogonal regions from the AC (mode × approval × execution)', () => {
    expect(Object.keys(sessionMachine.regions).sort()).toEqual(['approval', 'execution', 'mode'])
  })

  it('starts in read-only mode with idle approval + execution', () => {
    const s = initialState(sessionMachine)
    expect(inState(s, 'mode', 'read-only')).toBe(true)
    expect(inState(s, 'approval', 'idle')).toBe(true)
    expect(inState(s, 'execution', 'idle')).toBe(true)
  })

  it('models all three permission modes as global mode states', () => {
    let s = initialState(sessionMachine)
    s = transition(sessionMachine, s, { type: 'SET_MODE_WORKSPACE' })
    expect(inState(s, 'mode', 'workspace-write')).toBe(true)
    s = transition(sessionMachine, s, { type: 'SET_MODE_DANGER' })
    expect(inState(s, 'mode', 'danger-full-access')).toBe(true)
  })

  it('guards the tool-approval transition: only enters awaiting when approval is required', () => {
    const s0 = initialState(sessionMachine)
    // guard false → stays idle
    const denied = transition(
      sessionMachine,
      s0,
      { type: 'TOOL_REQUESTED', requiresApproval: false },
      {
        guards: sessionGuards,
      },
    )
    expect(inState(denied, 'approval', 'idle')).toBe(true)
    // guard true → enters awaiting_tool_approval
    const awaiting = transition(
      sessionMachine,
      s0,
      { type: 'TOOL_REQUESTED', requiresApproval: true },
      {
        guards: sessionGuards,
      },
    )
    expect(inState(awaiting, 'approval', 'awaiting_tool_approval')).toBe(true)
  })

  it('execution region is hierarchical: running descends to tool_executing', () => {
    let s = initialState(sessionMachine)
    s = transition(sessionMachine, s, { type: 'TOOL_START' })
    expect(inState(s, 'execution', 'running')).toBe(true)
    expect(inState(s, 'execution', 'tool_executing')).toBe(true)
  })

  it('resumes the prior mode after a suspend via history (zero context loss)', () => {
    let s = initialState(sessionMachine)
    s = transition(sessionMachine, s, { type: 'SET_MODE_WORKSPACE' })
    s = transition(sessionMachine, s, { type: 'SUSPEND' })
    expect(inState(s, 'mode', 'suspended')).toBe(true)
    s = transition(sessionMachine, s, { type: 'RESUME' })
    expect(inState(s, 'mode', 'workspace-write')).toBe(true)
  })
})
