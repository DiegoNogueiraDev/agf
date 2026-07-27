/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harel statechart engine for harness.session — formal session semantics.
 *
 * WHY a statechart (not flat state): the session has concerns that vary
 * *independently* — the permission mode, whether a tool is awaiting approval,
 * and whether a tool is executing. A flat enum forces their cartesian product
 * into one exploding list; Harel statecharts model them as **orthogonal
 * regions** that each transition on their own. They also give us **hierarchy**
 * (a compound state descends to an initial substate), **guards** (a predicate
 * gating a transition), and **history** (resume to the last active substate
 * without losing context) — exactly the four properties this task needs.
 *
 * This is a tiny, dependency-free, fully *pure* implementation (no XState — the
 * project is offline-packaged and dependency-cautious; the AC explicitly allows
 * a custom impl with formal-semantics tests). The engine never mutates its input
 * state: {@link transition} returns a new immutable {@link StatechartState}.
 * It is additive — it formalizes the session modes without touching the existing
 * `session-state.ts` persistence or its consumers (zero regression).
 * §ADR-deterministic-first — no I/O, no clocks, no randomness.
 *
 * Conventions: state ids are unique within a region (so a transition `target`
 * resolves to one state regardless of nesting depth, enabling cross-level
 * transitions). A path is root-most-first, leaf-last (e.g. `['running',
 * 'tool_executing']`). The reserved target `'$history'` resumes a region with
 * `history: true` to its remembered leaf.
 */

export interface StatechartEvent {
  type: string
  [key: string]: unknown
}

/** A guard predicate; returns true to permit its transition. */
export type Guard = (ctx: unknown, event: StatechartEvent) => boolean
export type GuardMap = Record<string, Guard>

/** A single transition: where to go, optionally gated by a named guard. */
export interface TransitionDef {
  /** Target state id (unique within the region) or the reserved `'$history'`. */
  target: string
  /** Name of the guard in the supplied {@link GuardMap}; transition is skipped if it fails. */
  guard?: string
}

/** A state node — may be compound (has `initial` + `states`) and/or handle events (`on`). */
export interface StateDef {
  initial?: string
  states?: Record<string, StateDef>
  on?: Record<string, TransitionDef>
}

/** An orthogonal region: an independent state machine that runs in parallel. */
export interface RegionDef {
  initial: string
  /** When true, `'$history'` targets resume this region to its last active leaf. */
  history?: boolean
  states: Record<string, StateDef>
}

/** A statechart machine: a set of orthogonal regions. */
export interface Machine {
  id: string
  regions: Record<string, RegionDef>
}

/** The active configuration: each region's active path + remembered history leaf. */
export interface StatechartState {
  value: Record<string, string[]>
  history: Record<string, string[]>
}

/** Options for {@link transition}. */
export interface TransitionOptions {
  guards?: GuardMap
  ctx?: unknown
}

const HISTORY_TARGET = '$history'

/** Resolve the {@link StateDef} reached by following `path` from a region root. */
function defAtPath(region: RegionDef, path: readonly string[]): StateDef {
  let states: Record<string, StateDef> | undefined = region.states
  let def: StateDef = { states: region.states }
  for (const id of path) {
    const next: StateDef | undefined = states?.[id]
    if (!next) break
    def = next
    states = next.states
  }
  return def
}

/** Extend a (possibly compound) path down through `initial` links to a leaf. */
function descendToLeaf(region: RegionDef, base: readonly string[]): string[] {
  const path = [...base]
  let def = defAtPath(region, path)
  while (def.initial && def.states?.[def.initial]) {
    path.push(def.initial)
    def = def.states[def.initial]
  }
  return path
}

/** Depth-first search for the path to a state id (ids are unique within a region). */
function findPath(states: Record<string, StateDef>, targetId: string, prefix: string[] = []): string[] | null {
  for (const [id, def] of Object.entries(states)) {
    const here = [...prefix, id]
    if (id === targetId) return here
    if (def.states) {
      const sub = findPath(def.states, targetId, here)
      if (sub) return sub
    }
  }
  return null
}

/** Build the initial state: every region descended to its initial leaf. */
export function initialState(machine: Machine): StatechartState {
  const value: Record<string, string[]> = {}
  for (const [name, region] of Object.entries(machine.regions)) {
    value[name] = descendToLeaf(region, [region.initial])
  }
  return { value, history: {} }
}

/** True when `stateId` is part of `region`'s currently active path. */
export function inState(state: StatechartState, region: string, stateId: string): boolean {
  return (state.value[region] ?? []).includes(stateId)
}

/** Compute one region's next path + history for an event (pure). */
function stepRegion(
  region: RegionDef,
  curPath: string[],
  curHistory: string[] | undefined,
  event: StatechartEvent,
  opts: TransitionOptions,
): { path: string[]; history?: string[] } {
  // Find the nearest ancestor (leaf-first) that handles this event type.
  for (let depth = curPath.length; depth >= 1; depth--) {
    const handler = defAtPath(region, curPath.slice(0, depth)).on?.[event.type]
    if (!handler) continue

    if (handler.guard) {
      const guard = opts.guards?.[handler.guard]
      if (!guard || !guard(opts.ctx, event)) return { path: curPath } // blocked → unchanged
    }

    if (handler.target === HISTORY_TARGET) {
      const remembered = curHistory && curHistory.length > 0 ? curHistory : [region.initial]
      return { path: descendToLeaf(region, remembered), history: region.history ? curPath : curHistory }
    }

    const found = findPath(region.states, handler.target)
    if (!found) return { path: curPath } // unknown target → defensive no-op
    return { path: descendToLeaf(region, found), history: region.history ? curPath : curHistory }
  }
  return { path: curPath } // no region state handles this event
}

/**
 * Apply an event to every orthogonal region and return a new immutable state.
 * Regions that do not handle the event are carried over unchanged.
 */
export function transition(
  machine: Machine,
  state: StatechartState,
  event: StatechartEvent,
  opts: TransitionOptions = {},
): StatechartState {
  const value: Record<string, string[]> = {}
  const history: Record<string, string[]> = { ...state.history }

  for (const [name, region] of Object.entries(machine.regions)) {
    const curPath = state.value[name] ?? descendToLeaf(region, [region.initial])
    const res = stepRegion(region, curPath, history[name], event, opts)
    value[name] = res.path
    if (res.history !== undefined) history[name] = res.history
  }

  return { value, history }
}

// ── The concrete session machine for harness.session ───────────────────────────

/** Guards for {@link sessionMachine}. */
export const sessionGuards: GuardMap = {
  /** Tool-approval is only entered when the request actually requires approval. */
  toolApprovalRequired: (_ctx, event): boolean => event.requiresApproval === true,
}

/**
 * The session statechart: three orthogonal regions matching the AC —
 * `mode × approval × execution`. `mode` carries shallow history so a suspend can
 * resume to the prior permission mode; `execution` is hierarchical (`running`
 * descends to `tool_executing`); `approval` is guarded.
 */
export const sessionMachine: Machine = {
  id: 'session',
  regions: {
    mode: {
      initial: 'read-only',
      history: true,
      states: {
        'read-only': {
          on: {
            SET_MODE_WORKSPACE: { target: 'workspace-write' },
            SET_MODE_DANGER: { target: 'danger-full-access' },
            SUSPEND: { target: 'suspended' },
          },
        },
        'workspace-write': {
          on: {
            SET_MODE_READONLY: { target: 'read-only' },
            SET_MODE_DANGER: { target: 'danger-full-access' },
            SUSPEND: { target: 'suspended' },
          },
        },
        'danger-full-access': {
          on: {
            SET_MODE_READONLY: { target: 'read-only' },
            SET_MODE_WORKSPACE: { target: 'workspace-write' },
            SUSPEND: { target: 'suspended' },
          },
        },
        suspended: {
          on: { RESUME: { target: HISTORY_TARGET } },
        },
      },
    },
    approval: {
      initial: 'idle',
      states: {
        idle: {
          on: { TOOL_REQUESTED: { target: 'awaiting_tool_approval', guard: 'toolApprovalRequired' } },
        },
        awaiting_tool_approval: {
          on: { APPROVE: { target: 'idle' }, DENY: { target: 'idle' } },
        },
      },
    },
    execution: {
      initial: 'idle',
      states: {
        idle: {
          on: { TOOL_START: { target: 'running' } },
        },
        running: {
          initial: 'tool_executing',
          states: {
            tool_executing: {
              on: { TOOL_DONE: { target: 'idle' }, TOOL_FAIL: { target: 'idle' } },
            },
          },
        },
      },
    },
  },
}
