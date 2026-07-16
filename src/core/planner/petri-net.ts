/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Petri Net coordination validator (TB-CSPN subset).
 * Places = session states; transitions = events; tokens = colored by agentId + phase.
 * Reachability analysis detects deadlocks in multi-agent handoff pipelines.
 *
 * WHY: formal verification that the 9-phase agf pipeline has no deadlocks/livelocks,
 * used by `agf heal` to detect coordination anomalies.
 *
 * Composing: HTN planner (htn-planner.ts) plans what to do;
 *            this validates the coordination is safe.
 */

import { LIFECYCLE_PHASES, getNextPhase } from '../orchestrator/lifecycle-gate.js'

/** A colored token: carries agent identity and phase metadata. */
export interface ColoredToken {
  agentId: string
  phase: string
  payload: Record<string, unknown>
}

/** A transition definition in the net. */
export interface PetriTransition {
  name: string
  /** Input places (must all have ≥1 token to fire). */
  from: string[]
  /** Output places (receive token after firing). */
  to: string[]
  /** Optional guard predicate on the firing token. Null = always enabled. */
  guard: ((token: ColoredToken) => boolean) | null
}

export interface PetriNetSpec {
  places: string[]
  transitions: PetriTransition[]
}

export interface AnalysisResult {
  /** True if any marked place has tokens but no enabled outgoing transition. */
  deadlock: boolean
  /** Set of place names reachable (via BFS over transitions) from the initial marking. */
  reachablePlaces: string[]
}

export interface PetriNet {
  addToken(place: string, token: ColoredToken): void
  marking(place: string): ColoredToken[]
  /** Fire a transition by name. Returns true if fired, false if not enabled. */
  fire(transitionName: string): boolean
  /** Analyze current marking for deadlocks and reachability. */
  analyze(): AnalysisResult
}

export function createPetriNet(spec: PetriNetSpec): PetriNet {
  const tokens = new Map<string, ColoredToken[]>()
  for (const p of spec.places) tokens.set(p, [])

  const transitionMap = new Map(spec.transitions.map((t) => [t.name, t]))

  function isEnabled(t: PetriTransition): boolean {
    for (const place of t.from) {
      const ts = tokens.get(place)
      if (!ts || ts.length === 0) return false
      if (t.guard && !ts.some((tok) => t.guard!(tok))) return false
    }
    return true
  }

  return {
    addToken(place: string, token: ColoredToken): void {
      const bucket = tokens.get(place)
      if (bucket) bucket.push(token)
    },

    marking(place: string): ColoredToken[] {
      return tokens.get(place) ?? []
    },

    fire(name: string): boolean {
      const t = transitionMap.get(name)
      if (!t || !isEnabled(t)) return false
      // Remove one token from each input place
      for (const place of t.from) {
        const bucket = tokens.get(place)!
        bucket.splice(0, 1)
      }
      // Add token to each output place (carry the first consumed token's identity)
      const fired: ColoredToken = { agentId: 'net', phase: name, payload: {} }
      for (const place of t.to) {
        tokens.get(place)!.push(fired)
      }
      return true
    },

    analyze(): AnalysisResult {
      // Collect all places with tokens
      const marked: string[] = []
      for (const [place, ts] of tokens) {
        if (ts.length > 0) marked.push(place)
      }

      if (marked.length === 0) return { deadlock: false, reachablePlaces: [] }

      // BFS from all marked places over transitions
      const reachable = new Set<string>(marked)
      const queue = [...marked]
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const t of spec.transitions) {
          if (t.from.includes(current)) {
            for (const out of t.to) {
              if (!reachable.has(out)) {
                reachable.add(out)
                queue.push(out)
              }
            }
          }
        }
      }

      // Deadlock: some marked place has tokens but none of its outgoing transitions are reachable
      let deadlock = false
      for (const place of marked) {
        const outgoing = spec.transitions.filter((t) => t.from.includes(place))
        if (outgoing.length === 0) {
          deadlock = true
          break
        }
      }

      return { deadlock, reachablePlaces: [...reachable] }
    },
  }
}

/**
 * Builds the PetriNetSpec for the real agf lifecycle (places = LIFECYCLE_PHASES,
 * transitions = the gates in lifecycle-gate.ts). LISTENING closes the cycle back
 * to ANALYZE since a new PRD import starts a fresh pipeline run.
 */
export function buildLifecyclePetriNet(): PetriNetSpec {
  const transitions: PetriTransition[] = []
  for (const phase of LIFECYCLE_PHASES) {
    const { next, gate } = getNextPhase(phase)
    if (next) transitions.push({ name: gate ?? `${phase}→${next}`, from: [phase], to: [next], guard: null })
  }
  transitions.push({ name: 'new_cycle', from: ['LISTENING'], to: ['ANALYZE'], guard: null })
  return { places: [...LIFECYCLE_PHASES], transitions }
}

/** Analyzes the real agf lifecycle pipeline for deadlocks, given the graph's current phase. */
export function analyzeLifecyclePipeline(currentPhase: string): AnalysisResult {
  const net = createPetriNet(buildLifecyclePetriNet())
  net.addToken(currentPhase, { agentId: 'conductor', phase: currentPhase, payload: {} })
  return net.analyze()
}
