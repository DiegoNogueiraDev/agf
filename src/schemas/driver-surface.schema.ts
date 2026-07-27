/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * DriverSurface — ONDE uma lever de economia surte efeito no agent driver
 * (a LLM condutora, porta de entrada dos tokens). Contract node_eb434a0955c2.
 *
 * Mapa fixo de pontos de disparo (fonte única, consumido pelo registry em
 * economy-levers-config.ts, pelo gap-check driver_boundary_missing e pelo
 * savings --by-surface): compress-run ⇒ hook · task-prep/context-pack ⇒ context ·
 * brief-builder ⇒ brief · saída --ai ⇒ envelope · resto ⇒ internal.
 * `internal` é permitido mas explícito — nunca conta como efeito-no-driver.
 */

import { z } from 'zod/v4'

export const DRIVER_SURFACES = ['hook', 'context', 'brief', 'envelope', 'internal'] as const

export const DriverSurfaceSchema = z
  .enum(DRIVER_SURFACES)
  .describe(
    'Superfície do driver onde a lever dispara: hook=compress run (PostToolUse), ' +
      'context=task-prep/context-pack, brief=agf brief, envelope=saída --ai, internal=só interno',
  )

export type DriverSurface = z.infer<typeof DriverSurfaceSchema>
