/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Motor de fases — colapsa as 9 fases internas (herdadas do graph-flow legado)
 * em 3 fases canônicas SHAPE → BUILD → SHIP. Remove *cerimônia*, não
 * *disciplina*: o rigor (TDD/AC/DoD) vive dentro de BUILD. O enum interno é
 * preservado para compat de dados/CLI via `toCanonicalPhase`.
 *
 * Ref: RFC token-economy-redesign §6.1.
 */
import { z } from 'zod/v4'
import { PlannerError } from '../utils/errors.js'

export const CanonicalPhaseSchema = z.enum(['SHAPE', 'BUILD', 'SHIP'])
export type CanonicalPhase = z.infer<typeof CanonicalPhaseSchema>

/** Fases canônicas em ordem de ciclo. */
export const CANONICAL_PHASES = CanonicalPhaseSchema.options

export const InternalPhaseSchema = z.enum([
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
])
export type InternalPhase = z.infer<typeof InternalPhaseSchema>

/** Cada fase interna pertence a exatamente uma canônica. */
export const INTERNAL_TO_CANONICAL: Record<InternalPhase, CanonicalPhase> = {
  ANALYZE: 'SHAPE',
  DESIGN: 'SHAPE',
  PLAN: 'SHAPE',
  IMPLEMENT: 'BUILD',
  VALIDATE: 'BUILD',
  REVIEW: 'SHIP',
  HANDOFF: 'SHIP',
  DEPLOY: 'SHIP',
  LISTENING: 'SHIP',
}

/** Inversa: quais fases internas cada canônica absorve. */
export const CANONICAL_TO_INTERNAL: Record<CanonicalPhase, InternalPhase[]> = {
  SHAPE: ['ANALYZE', 'DESIGN', 'PLAN'],
  BUILD: ['IMPLEMENT', 'VALIDATE'],
  SHIP: ['REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'],
}

/**
 * Resolve um nome de fase (canônico OU interno, case-insensitive) para a
 * canônica correspondente. Garante compat com dados/CLI que ainda usem os
 * nomes antigos de 9 fases.
 */
export function toCanonicalPhase(name: string): CanonicalPhase {
  const upper = name.trim().toUpperCase()
  const asCanonical = CanonicalPhaseSchema.safeParse(upper)
  if (asCanonical.success) return asCanonical.data
  const asInternal = InternalPhaseSchema.safeParse(upper)
  if (asInternal.success) return INTERNAL_TO_CANONICAL[asInternal.data]
  throw new PlannerError(
    `Fase desconhecida: "${name}". Esperado uma de ${CANONICAL_PHASES.join('/')} ou uma fase interna (${InternalPhaseSchema.options.join(', ')}).`,
  )
}

/** Sinal de status do grafo usado para detecção advisory de fase. */
export interface PhaseSignal {
  totalNodes: number
  backlog: number
  inProgress: number
  done: number
}

/**
 * Detecção *advisory* de fase a partir do status agregado do grafo — nunca um
 * gate bloqueante. Heurística:
 * - sem nodes, ou só backlog → SHAPE (ainda modelando/planejando)
 * - tudo done e nada pendente → SHIP (entregando/ouvindo)
 * - caso contrário (algo em progresso ou parcialmente done) → BUILD
 */
export function detectPhase(signal: PhaseSignal): CanonicalPhase {
  const { totalNodes, backlog, inProgress, done } = signal
  if (totalNodes === 0) return 'SHAPE'
  if (done === 0 && inProgress === 0) return 'SHAPE'
  if (backlog === 0 && inProgress === 0 && done > 0) return 'SHIP'
  return 'BUILD'
}
