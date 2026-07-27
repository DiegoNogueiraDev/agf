/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Observability module — persistent tracing, guardrails, decisions, experiments.
 *
 * Inspired by LangWatch patterns, adapted for local-first SQLite architecture.
 * Each sub-module maps to a theoretical foundation:
 *   - TraceStore      → T1 Kalman Observability (1960)
 *   - GuardrailAdapter → T2 Design by Contract (Meyer, 1986)
 *   - DecisionStore    → T3 Decision Theory (von Neumann & Morgenstern, 1944)
 *   - DatasetStore     → T4 Hypothesis Testing (Fisher, 1925)
 *   - QualityPolicy    → T5 Safety/Liveness (Lamport, 1977)
 *   - ScenarioRunner   → T6 Mutation Testing (DeMillo et al., 1978)
 *   - Cost tracking    → T7 Bounded Rationality (Simon, 1955)
 */

export { TraceStore } from './trace-store.js'
export type { TraceRecord, SpanRecord, TraceTokens, EndSpanOptions, NodeCost, CostSummary } from './trace-store.js'

export { runGuardrailPipeline, GuardrailStore } from './guardrail-adapter.js'
export type {
  Guardrail,
  GuardrailResult,
  GuardrailContext,
  GuardrailPipelineResult,
  GuardrailPipelineOptions,
  GuardrailExecutionRecord,
  GuardrailRecordInput,
} from './guardrail-adapter.js'

export { DatasetStore } from './dataset-store.js'
export type { DatasetRecord, DatasetEntry } from './dataset-store.js'

export { ExperimentRunner } from './experiment-runner.js'
export type { EvaluatorConfig, ExperimentRecord, ExperimentSummary, ComparisonResult } from './experiment-runner.js'

export { QualityPolicyStore, evaluatePolicy } from './quality-policy.js'
export type { QualityGate, QualityPolicy, GateResult, PolicyResult } from './quality-policy.js'

export { ScenarioRunner, seedProjectWithNodes } from './scenario-runner.js'
export type {
  Scenario,
  ScenarioStep,
  ScenarioAssertion,
  ScenarioSetup,
  ScenarioResult,
  AssertionFailure,
} from './scenario-runner.js'

export {
  createCounter,
  createHistogram,
  getSnapshot,
  resetAll,
  httpRequestsTotal,
  httpErrorsTotal,
  httpDurationMs,
  sqliteConnectionsActive,
  eventBusQueueDepth,
  errorsRate,
} from './metrics.js'
export type { Counter, Histogram, HistogramStats, MetricsSnapshot } from './metrics.js'
