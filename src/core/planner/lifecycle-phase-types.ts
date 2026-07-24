/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Shared types and constants for lifecycle phase logic.
 * WHY here: types imported by all sibling modules with zero circular deps.
 * Composing: imported by lifecycle-phase-rules.ts, lifecycle-phase-modes.ts,
 * lifecycle-phase-gates.ts. Re-exported via lifecycle-phase.ts barrel.
 */

export type LifecyclePhase =
  'ANALYZE' | 'DESIGN' | 'PLAN' | 'IMPLEMENT' | 'VALIDATE' | 'REVIEW' | 'HANDOFF' | 'DEPLOY' | 'LISTENING'

/**
 * V11 Maestro Phase 3 — every analyze mode (53 total) lives in EXACTLY ONE phase.
 * The list mirrors the enum in `src/mcp/tools/analyze.ts`. Integrity is enforced
 * by `src/tests/get-modes-for-phase.test.ts` (no orphans, no duplicates).
 */
export const ALL_ANALYZE_MODES = [
  'prd_quality',
  'scope',
  'ready',
  'risk',
  'blockers',
  'cycles',
  'critical_path',
  'contract_coverage',
  'data_integrity',
  'decompose',
  'adr',
  'formula_consistency',
  'traceability',
  'coupling',
  'interfaces',
  'tech_risk',
  'design_ready',
  'implement_done',
  'tdd_check',
  'performance_budget',
  'progress',
  'state_completeness',
  'validate_ready',
  'done_integrity',
  'status_flow',
  'review_ready',
  'handoff_ready',
  'doc_completeness',
  'deploy_ready',
  'release_check',
  'listening_ready',
  'backlog_health',
  'sprint_health',
  'auto_ready',
  'scenario_coverage',
  'asset_blockers',
  'config_coverage',
  'metric_coverage',
  'concurrency_risk',
  'economy_simulation',
  'cfd',
  'code_sync',
  'smart_decompose',
  'security_scan',
  'code_quality',
  'test_coverage',
  'observability_check',
  'harness_scan',
  'harness_trend',
  'harness_advice',
  'harness_remediate',
  'adr_challenge',
  'orphan_tasks',
] as const

export type AnalyzeMode = (typeof ALL_ANALYZE_MODES)[number]

export interface McpAgentSuggestion {
  name: string
  action: string
  tools?: string[]
}

export interface PhaseGuidance {
  reminder: string
  suggestedTools: string[]
  principles: string[]
  suggestedMcpAgents?: McpAgentSuggestion[]
  suggestedSkills?: string[]
}

export interface PhaseDetectionOptions {
  hasSnapshots?: boolean
  phaseOverride?: LifecyclePhase | null
}

export interface LifecycleWarning {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

export type StrictnessMode = 'strict' | 'advisory'
