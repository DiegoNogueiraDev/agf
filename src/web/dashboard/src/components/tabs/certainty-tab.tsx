/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Certainty tab (node_3ecf21eea0dc) — the WEB consumer surface of Delivery
 * Certainty. Thin wire: the verdict is computed by the same core composer the
 * CLI and the done-gate use (GET /api/v1/certainty/:nodeId); the front NEVER
 * recomputes a pillar — it renders what the contract carries.
 *
 * Empty-state discipline: a real verdict is ALWAYS rendered, including a red
 * pillar. Hiding a PROVEN_INCOMPLETE behind "No data" would recreate the exact
 * silent-failure this whole epic exists to kill.
 */

import React, { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { DeliveryCertaintyPayload } from '@/lib/types'

const BAND_TONE: Record<DeliveryCertaintyPayload['band'], string> = {
  PROVEN: 'text-emerald-400',
  PROVEN_INCOMPLETE: 'text-amber-400',
  UNKNOWN: 'text-muted',
}

const STATE_TONE: Record<string, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  na: 'text-muted',
}

/**
 * Presentational verdict view — pure props, no fetching, so the rendering rules
 * (band visible, every pillar listed with its state) are testable in isolation.
 */
export function CertaintyView({ certainty }: { certainty: DeliveryCertaintyPayload }): React.JSX.Element {
  return (
    <section aria-label="Delivery Certainty" className="p-4 space-y-4">
      <header className="space-y-1">
        <div className={`text-2xl font-semibold ${BAND_TONE[certainty.band]}`}>{certainty.band}</div>
        <div className="text-sm text-muted">
          confidence <span className="font-mono">{certainty.confidence}</span> · {certainty.nodeId}
        </div>
        {certainty.blockingPillars.length > 0 && (
          <div className="text-sm text-red-400">blocked by: {certainty.blockingPillars.join(', ')}</div>
        )}
      </header>

      <ul className="space-y-2">
        {certainty.pillars.map((p) => (
          <li key={p.key} data-testid="certainty-pillar" className="rounded border border-white/10 p-2">
            <div data-testid={`pillar-${p.key}`} data-state={p.state} className="flex items-baseline gap-2">
              <span className={`font-mono text-sm ${STATE_TONE[p.state] ?? 'text-muted'}`}>{p.state}</span>
              <span className="font-medium">{p.key}</span>
              <span className="text-xs text-muted">({p.kind})</span>
            </div>
            <div className="text-xs text-muted mt-1">{p.detail}</div>
            <div className="text-xs text-muted italic mt-1">{p.rationale}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Container — fetches the verdict for a node and handles loading/error. */
export function CertaintyTab({ nodeId }: { nodeId: string }): React.JSX.Element {
  const [data, setData] = useState<DeliveryCertaintyPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .getCertainty(nodeId)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nodeId])

  if (loading) {
    return (
      <section aria-label="Delivery Certainty" className="p-4 text-sm text-muted">
        Loading…
      </section>
    )
  }

  // An API failure (unknown node, network) degrades to a readable message —
  // never a blank screen and never a fake verdict.
  if (error || !data) {
    return (
      <section aria-label="Delivery Certainty" className="p-4 text-sm text-red-400">
        Could not load certainty{error ? `: ${error}` : ''}
      </section>
    )
  }

  return <CertaintyView certainty={data} />
}
