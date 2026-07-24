/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Quorum gate — broadcast only when a quorum of correlated findings accumulates.
 *
 * Anchor: bacterial quorum sensing. Bacteria (e.g. Vibrio fischeri) secrete
 * autoinducers and trigger a collective behaviour only once population density crosses
 * a concentration threshold — it is not worth acting alone. In the swarm, A2A broadcasts
 * cost tokens; agents accumulate correlated findings per topic and broadcast only when
 * the quorum is reached, staying local below it — cutting mailbox chatter while
 * preserving consensus quality.
 *
 * Deterministic. Token lever `quorum_gate`. The swarm itself is opt-in.
 */

import { McpGraphError } from '../utils/errors.js'

export interface QuorumGateOptions {
  /** Accumulated correlation weight required to fire a broadcast. */
  quorum: number
}

export class QuorumGate {
  private readonly quorum: number
  private readonly pendingByTopic = new Map<string, number>()

  constructor(opts: QuorumGateOptions) {
    if (!(opts.quorum > 0)) throw new McpGraphError(`QuorumGate: quorum must be positive (got ${opts.quorum})`)
    this.quorum = opts.quorum
  }

  /**
   * Add a finding's `weight` (default 1) to a topic. Returns `true` and resets the topic
   * when the quorum is reached (⇒ broadcast); `false` otherwise (⇒ stay local).
   */
  accumulate(topic: string, weight = 1): boolean {
    const next = (this.pendingByTopic.get(topic) ?? 0) + weight
    if (next >= this.quorum) {
      this.pendingByTopic.delete(topic)
      return true
    }
    this.pendingByTopic.set(topic, next)
    return false
  }

  /** Current accumulated weight for a topic (0 if none or already fired). */
  pending(topic: string): number {
    return this.pendingByTopic.get(topic) ?? 0
  }

  /** Clear accumulation for one topic, or all topics when no topic is given. */
  reset(topic?: string): void {
    if (topic === undefined) this.pendingByTopic.clear()
    else this.pendingByTopic.delete(topic)
  }
}
