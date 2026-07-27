/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Single source of truth for ALL agf CLI commands + subcommands.
 * The command table in context files (CLAUDE.md, AGENTS.md, copilot) is
 * generated dynamically from this registry — zero manual sync needed.
 *
 * Entries are split into three sub-files for maintainability (each ≤ 800 lines):
 *   command-registry-graph.ts    — front-door, grafo-leitura, grafo-mutacao, pipeline, planejamento
 *   command-registry-quality.ts  — qualidade, governanca, dev-tooling
 *   command-registry-economy.ts  — modelo-metricas, memoria, setup
 */

export interface CommandDescriptor {
  name: string
  parent?: string
  description: string
  usage?: string
  category: string
}

export { REGISTRY_GRAPH } from './command-registry-graph.js'
export { REGISTRY_QUALITY } from './command-registry-quality.js'
export { REGISTRY_ECONOMY } from './command-registry-economy.js'

import { REGISTRY_GRAPH } from './command-registry-graph.js'
import { REGISTRY_QUALITY } from './command-registry-quality.js'
import { REGISTRY_ECONOMY } from './command-registry-economy.js'

/**
 * Complete command registry — single source of truth.
 * When you add a new command or subcommand, add it to the appropriate sub-file first.
 */
export const COMMAND_REGISTRY: CommandDescriptor[] = [...REGISTRY_GRAPH, ...REGISTRY_QUALITY, ...REGISTRY_ECONOMY]

/** Category labels for context file headings. */
export const CATEGORY_LABELS: Record<string, string> = {
  'front-door': 'Front door (SHAPE → BUILD → SHIP)',
  'grafo-leitura': 'Grafo — leitura',
  'grafo-mutacao': 'Grafo — mutação',
  pipeline: 'Pipeline de task (2 calls)',
  planejamento: 'Decomposição & planejamento',
  qualidade: 'Qualidade, harness, forecast',
  memoria: 'Memória, snapshot, heal',
  'modelo-metricas': 'Modelo, métricas, custo',
  governanca: 'Spec-kit & governança',
  'dev-tooling': 'Dev tooling (test, lint, usage)',
  setup: 'Setup & ambiente',
}

/** Category display order. */
export const CATEGORY_ORDER = [
  'front-door',
  'grafo-leitura',
  'grafo-mutacao',
  'pipeline',
  'planejamento',
  'qualidade',
  'memoria',
  'modelo-metricas',
  'governanca',
  'dev-tooling',
  'setup',
]
