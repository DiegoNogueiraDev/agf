/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Phase guidance and mode mappings — getPhaseGuidance, getModesForPhase.
 * WHY here: static guidance data separated from dynamic gate checking and
 * rule evaluation. Composing: re-exported via lifecycle-phase.ts barrel;
 * GUIDANCE is imported by lifecycle-phase-rules.ts for detectWarnings.
 */

import type { LifecyclePhase, PhaseGuidance } from './lifecycle-phase-types.js'

export const GUIDANCE: Record<LifecyclePhase, PhaseGuidance> = {
  ANALYZE: {
    reminder: 'ANALYZE: PRD + requisitos antes de código.',
    suggestedTools: ['import_prd', 'node', 'edge', 'search', 'analyze'],
    principles: ['Definir antes de construir', 'Requisitos mensuráveis'],
  },
  DESIGN: {
    reminder: 'DESIGN: Arquitetura + ADRs + interfaces.',
    suggestedTools: ['add_node', 'edge', 'analyze', 'export'],
    principles: ['Skeleton & Organs', 'Interface-first'],
  },
  PLAN: {
    reminder: 'PLAN: Sprint planning + decomposição + sync docs.',
    suggestedTools: ['plan_sprint', 'analyze', 'sync_stack_docs', 'edge'],
    principles: ['Decomposição atômica', 'Dependências explícitas'],
  },
  IMPLEMENT: {
    reminder: 'IMPLEMENT: TDD Red→Green→Refactor. Test first.',
    suggestedTools: ['start_task', 'finish_task', 'validate', 'analyze'],
    principles: ['TDD Red→Green→Refactor', 'Anti-one-shot'],
  },
  VALIDATE: {
    reminder: 'VALIDATE: E2E + AC verification.',
    suggestedTools: ['validate', 'metrics', 'analyze', 'list'],
    principles: ['Zero tolerance regressões', 'AC como contrato'],
  },
  REVIEW: {
    reminder: 'REVIEW: Code review + blast radius.',
    suggestedTools: ['export', 'metrics', 'analyze'],
    principles: ['Blast radius check', 'Non-regression rule'],
  },
  HANDOFF: {
    reminder: 'HANDOFF: PR + docs + export grafo.',
    suggestedTools: ['export', 'snapshot', 'metrics', 'analyze'],
    principles: ['Documentação como entrega', 'Knowledge captured'],
  },
  DEPLOY: {
    reminder: 'DEPLOY: CI + release + smoke tests.',
    suggestedTools: ['export', 'snapshot', 'analyze', 'metrics'],
    principles: ['CI green before release', 'Post-release validation'],
  },
  LISTENING: {
    reminder: 'LISTENING: Feedback → novos nodes → novo ciclo.',
    suggestedTools: ['add_node', 'import_prd', 'search', 'list', 'analyze'],
    principles: ['Feedback contínuo', 'Iteração incremental'],
  },
}

/** Get reminder, tools, and principles for a lifecycle phase. */
export function getPhaseGuidance(phase: LifecyclePhase): PhaseGuidance {
  return GUIDANCE[phase]
}

// ── Phase → analyze() modes mapping ────────────────────────────
// Backing data for graph_lifecycle (Task 3.2): one wrapper that runs every
// mode relevant to a given phase via Promise.all and aggregates the outputs.
// Source of truth for the universe of modes is `ANALYZE_MODES` in
// src/mcp/tools/analyze.ts. Every mode there must appear in at least one
// phase entry below — orphans are caught by the test suite.

/**
 * Static mapping of lifecycle phase → analyze() modes that the
 * `graph_lifecycle` facade should fan-out across.
 *
 * Decisions:
 *   - Modes that span multiple phases (e.g. `harness_scan` is useful in
 *     IMPLEMENT, VALIDATE, REVIEW) are listed in every phase that needs
 *     them. Duplicates are intentional — the facade dedupes at run time
 *     if it ever needs to.
 *   - `ANALYZE` covers PRD-quality / requirements-shape / risks. `DESIGN`
 *     covers architecture / interfaces / contracts. `PLAN` covers sprint
 *     mechanics. `IMPLEMENT` covers TDD + code coupling. `VALIDATE` covers
 *     test coverage + observability. `REVIEW` covers DoD + state integrity.
 *     `HANDOFF` covers docs + release readiness. `DEPLOY` covers release
 *     check. `LISTENING` covers feedback / next-cycle triggers.
 */
const PHASE_MODES: Record<LifecyclePhase, readonly string[]> = {
  ANALYZE: ['prd_quality', 'scope', 'decompose', 'smart_decompose', 'risk', 'orphan_tasks'],
  DESIGN: ['adr', 'traceability', 'coupling', 'interfaces', 'tech_risk', 'design_ready', 'adr_challenge'],
  PLAN: [
    'ready',
    'auto_ready',
    'backlog_health',
    'sprint_health',
    'critical_path',
    'blockers',
    'cycles',
    'formula_consistency',
  ],
  IMPLEMENT: ['tdd_check', 'implement_done', 'code_sync', 'code_quality', 'performance_budget'],
  VALIDATE: [
    'validate_ready',
    'test_coverage',
    'security_scan',
    'observability_check',
    'scenario_coverage',
    'asset_blockers',
    'config_coverage',
    'metric_coverage',
    'concurrency_risk',
    'contract_coverage',
    'data_integrity',
    'economy_simulation',
  ],
  REVIEW: [
    'review_ready',
    'done_integrity',
    'status_flow',
    'state_completeness',
    'harness_scan',
    'harness_trend',
    'harness_advice',
    'harness_remediate',
    'progress',
    'cfd',
  ],
  HANDOFF: ['handoff_ready', 'doc_completeness'],
  DEPLOY: ['deploy_ready', 'release_check'],
  LISTENING: ['listening_ready'],
}

/**
 * Return the analyze() modes that `graph_lifecycle` should fan-out for the
 * given phase. Returns a fresh array per call — callers may mutate it
 * without affecting future invocations.
 *
 * Returns `[]` (never throws) when the phase is unknown, empty, null, or
 * undefined. This is intentional: the facade tool surfaces the empty
 * result as a structured warning rather than crashing the caller.
 *
 * @example
 *   getModesForPhase("DESIGN")
 *   // → ["adr","traceability","coupling","interfaces","tech_risk","design_ready","adr_challenge"]
 *
 *   getModesForPhase("WHATEVER" as LifecyclePhase)
 *   // → []
 */
export function getModesForPhase(phase: LifecyclePhase): string[] {
  if (!phase || typeof phase !== 'string') return []
  const modes = PHASE_MODES[phase]
  return modes ? [...modes] : []
}
