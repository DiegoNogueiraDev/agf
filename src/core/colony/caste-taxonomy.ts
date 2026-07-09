/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E1.1 — Colony caste taxonomy.
 * Zero-LLM. Pure definitions for task routing by complexity and model tier.
 *
 * Biological basis: leaf-cutter ant castes are size-differentiated for
 * different nest roles. Here: task complexity → caste → model tier routing.
 */

import type { ModelTier } from './colony-signals.js'

export type CasteKind = 'minima' | 'pequena' | 'media' | 'soldado'

export interface CasteDefinition {
  /** LLM tier appropriate for this caste's task complexity. */
  model_tier: ModelTier
  /** Maximum McCabe cyclomatic complexity acceptable for this caste. */
  max_complexity: number
  /** Task types this caste handles. */
  task_types: string[]
}

export const CASTE_TAXONOMY: Record<CasteKind, CasteDefinition> = {
  /** Minima — smallest tasks: cache, config, constants, trivial utilities. */
  minima: {
    model_tier: 'cheap',
    max_complexity: 5,
    task_types: ['chore', 'config', 'docs', 'rename', 'constant'],
  },
  /** Pequena — small tasks: single-function utilities, minor bug fixes, small refactors. */
  pequena: {
    model_tier: 'cheap',
    max_complexity: 10,
    task_types: ['fix', 'refactor', 'test', 'utility'],
  },
  /** Media — medium tasks: feature implementation, integration, multi-file changes. */
  media: {
    model_tier: 'build',
    max_complexity: 20,
    task_types: ['feat', 'integration', 'migration', 'api'],
  },
  /** Soldado — complex tasks: architecture decisions, security review, cross-system design. */
  soldado: {
    model_tier: 'frontier',
    max_complexity: 50,
    task_types: ['architecture', 'security', 'performance', 'design', 'epic'],
  },
}

export interface CasteListEntry {
  caste: CasteKind
  model_tier: ModelTier
  max_complexity: number
  task_types: string[]
}

export function getCasteDefinition(kind: CasteKind): CasteDefinition {
  return CASTE_TAXONOMY[kind]
}

export function listCastes(): CasteListEntry[] {
  return (Object.entries(CASTE_TAXONOMY) as [CasteKind, CasteDefinition][]).map(([caste, def]) => ({
    caste,
    model_tier: def.model_tier,
    max_complexity: def.max_complexity,
    task_types: def.task_types,
  }))
}
