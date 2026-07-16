/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * ColonyView (node_31ae9dd977c5) — visão figurativa da colônia: trilhas de
 * feromônio irradiando do ninho (centro), peso visual (stroke/opacity)
 * proporcional à força via colony-figuration (top-K — nunca centenas no DOM),
 * hover com key+amount (<title> nativo) e o band de entropia agregado.
 * Dados de use-colony-data (SSE debounced). SÓ CSS vars do tema — zero
 * paleta hardcoded.
 */

import React from 'react'
import { useColonyData } from '@/hooks/use-colony-data'
import { figureTrails } from '@/lib/colony-figuration'
import type { ColonyData } from '@/lib/types'

const VIEW_SIZE = 600
const CENTER = VIEW_SIZE / 2
const NEST_RADIUS = 14
const TRAIL_REACH = CENTER - 40

type Band = ColonyData['entropy']['band']

// Semântica do band → token do tema (cores vêm SÓ das CSS vars).
const BAND_COLOR_VAR: Record<Band, string> = {
  healthy: 'var(--color-success)',
  stagnant: 'var(--color-warning)',
  diffuse: 'var(--color-info)',
  unknown: 'var(--color-muted)',
}

export function ColonyView(): React.JSX.Element {
  const { data, loading, error } = useColonyData()

  if (loading) {
    return (
      <section aria-label="Colony" className="flex items-center justify-center h-full text-muted text-sm">
        Loading…
      </section>
    )
  }

  if (error) {
    return (
      <section aria-label="Colony" className="flex flex-col items-center justify-center h-full gap-2">
        <div role="alert" className="text-danger text-sm">
          {error}
        </div>
      </section>
    )
  }

  const trails = figureTrails(data?.trails ?? [])
  const band = data?.entropy.band ?? 'unknown'
  const hNorm = data?.entropy.hNorm ?? 0

  if (trails.length === 0) {
    return (
      <section
        aria-label="Colony"
        className="flex flex-col items-center justify-center h-full gap-2 text-muted text-sm"
      >
        <span>No pheromone trails yet — the colony deposits them as tasks complete.</span>
      </section>
    )
  }

  return (
    <section aria-label="Colony" className="flex flex-col gap-4 p-6 overflow-y-auto h-full">
      <header className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Colony</h2>
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ color: BAND_COLOR_VAR[band], border: `1px solid ${BAND_COLOR_VAR[band]}` }}
        >
          {band} · H {hNorm.toFixed(2)}
        </span>
        <span className="text-xs text-muted">{trails.length} strongest trails</span>
      </header>

      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        role="img"
        aria-label="Pheromone trails radiating from the nest, stroke proportional to strength"
        className="w-full max-w-3xl mx-auto"
      >
        {trails.map((trail, i) => {
          const angle = (2 * Math.PI * i) / trails.length
          const x = CENTER + Math.cos(angle) * (NEST_RADIUS + trail.normalized * TRAIL_REACH)
          const y = CENTER + Math.sin(angle) * (NEST_RADIUS + trail.normalized * TRAIL_REACH)
          return (
            <line
              key={trail.key}
              data-trail={trail.key}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--color-accent)"
              strokeWidth={trail.strokeWidth}
              strokeOpacity={trail.opacity}
              strokeLinecap="round"
            >
              <title>{`${trail.key} · ${trail.amount.toFixed(2)}`}</title>
            </line>
          )
        })}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={NEST_RADIUS}
          fill="var(--color-surface-elevated)"
          stroke="var(--color-edge)"
        />
      </svg>
    </section>
  )
}
