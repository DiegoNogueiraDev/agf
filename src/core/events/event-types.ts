/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type GraphEventType =
  | 'node:created'
  | 'node:updated'
  | 'node:deleted'
  | 'edge:created'
  | 'edge:deleted'
  | 'import:completed'
  | 'bulk:updated'
  | 'knowledge:indexed'
  | 'knowledge:deleted'
  | 'knowledge:quality_updated'
  | 'phase:transitioned'
  | 'sprint:planned'
  | 'validation:completed'
  | 'code:reindexed'
  | 'log:entry'
  | 'error:detected'
  | 'healing:memory_created'
  | 'healing:scan_completed'
  | 'healing:actions_executed'
  | 'healing:report_generated'
  | 'siebel:sif_imported'
  | 'siebel:composer_action'
  | 'siebel:objects_indexed'
  | 'siebel:sif_generated'
  | 'translation:job_created'
  | 'translation:analyzed'
  | 'translation:finalized'
  | 'translation:error'
  | 'dream:cycle_started'
  | 'dream:phase_started'
  | 'dream:phase_completed'
  | 'dream:cycle_completed'
  | 'dream:cycle_cancelled'
  | 'dream:cycle_failed'
  // Constitution events (spec-kit v8)
  | 'constitution:created'
  | 'constitution:updated'
  | 'constitution:check_completed'
  // Plugin events (spec-kit v8)
  | 'plugin:installed'
  | 'plugin:removed'
  | 'plugin:enabled'
  | 'plugin:disabled'
  | 'plugin:error'
  // Preset events (spec-kit v8)
  | 'preset:applied'
  | 'preset:created'
  // Spec evolution events (spec-kit v8)
  | 'spec:created'
  | 'spec:updated'
  | 'spec:synced'
  // Harness events (v3)
  | 'harness:scan_completed'
  | 'harness:regression_detected'
  // Multi-terminal orchestrator events (teamTask mode)
  | 'task:claimed'
  | 'task:released'
  | 'agent:heartbeat'
  // Autopilot recovery events (Phase D — Autonomous Loop)
  | 'autopilot:paused'
  | 'autopilot:escalation'
  | 'autopilot:rollback'
  // Observability events (LangWatch-inspired — Kalman Observability Theorem)
  | 'trace:created'
  | 'trace:completed'
  | 'span:created'
  | 'guardrail:executed'
  | 'decision:logged'
  | 'experiment:completed'
  // Security events (Hermes-agent integration)
  | 'security:injection_detected'
  | 'security:exfiltration_detected'
  // Cost tracking events (Hermes-agent integration)
  | 'cost:budget_exceeded'
  // Error classification events (Hermes-agent integration)
  | 'error:retry_attempted'
  | 'error:retry_exhausted'
  // Context pressure events (Hermes-agent integration)
  | 'context:pressure_warning'
  // Tool result persistence events (Hermes-agent integration)
  | 'tool:result_persisted'
  // Session events (Hermes-agent integration)
  | 'session:chained'
  // Delegation events (Hermes-agent integration)
  | 'agent:delegated'
  | 'agent:delegation_completed'
  | 'agent:delegation_failed'
  // Pipeline events (Hermes-agent integration)
  | 'pipeline:started'
  | 'pipeline:step_completed'
  | 'pipeline:completed'
  // OTS provenance events (Task 8.2)
  | 'ots:submitted'
  | 'ots:confirmed'
  | 'ots:retry_scheduled'
  // v11 Context-Pollination events (Task 1.3)
  | 'subtask_artifact:created'
  // Memory pressure events (EPIC 12 — Memory & CPU Guard)
  | 'memory:pressure_warning'
  | 'memory:pressure_critical'
  // Sentrux integration events (§EPIC-sentrux-adoption)
  | 'sentrux:scan_complete'
  // Self-healing stream events (§EPIC-self-healing — Task 3.2)
  | 'self_healing:signal_collected'
  | 'self_healing:pattern_detected'
  | 'self_healing:healing_proposed'
  | 'self_healing:healing_auto_applied'

export interface GraphEvent {
  type: GraphEventType
  timestamp: string
  payload: Record<string, unknown>
}

export interface NodeCreatedEvent extends GraphEvent {
  type: 'node:created'
  payload: { nodeId: string; title: string; nodeType: string }
}

export interface NodeUpdatedEvent extends GraphEvent {
  type: 'node:updated'
  payload: { nodeId: string; fields: string[] }
}

export interface NodeDeletedEvent extends GraphEvent {
  type: 'node:deleted'
  payload: { nodeId: string }
}

export interface EdgeCreatedEvent extends GraphEvent {
  type: 'edge:created'
  payload: { edgeId: string; from: string; to: string; relationType: string }
}

export interface EdgeDeletedEvent extends GraphEvent {
  type: 'edge:deleted'
  payload: { edgeId: string }
}

export interface ImportCompletedEvent extends GraphEvent {
  type: 'import:completed'
  payload: { nodesCreated: number; edgesCreated: number }
}

export interface BulkUpdatedEvent extends GraphEvent {
  type: 'bulk:updated'
  payload: { count: number; operation: string }
}

export interface KnowledgeIndexedEvent extends GraphEvent {
  type: 'knowledge:indexed'
  payload: { source: string; documentsIndexed: number }
}

export interface KnowledgeDeletedEvent extends GraphEvent {
  type: 'knowledge:deleted'
  payload: { source: string; documentsDeleted: number }
}

export interface PhaseTransitionedEvent extends GraphEvent {
  type: 'phase:transitioned'
  payload: {
    fromPhase: string
    toPhase: string
    forced: boolean
    nodesCount: number
    doneTasksCount: number
  }
}

export interface LogEntryEvent extends GraphEvent {
  type: 'log:entry'
  payload: { id: number; level: string; message: string; context?: Record<string, unknown> }
}

export interface ErrorDetectedEvent extends GraphEvent {
  type: 'error:detected'
  payload: { toolName: string; errorMessage: string; errorCategory: string; errorHash: string }
}

export interface HealingMemoryCreatedEvent extends GraphEvent {
  type: 'healing:memory_created'
  payload: { memoryName: string; errorCategory: string; errorHash: string }
}

export interface HealingScanCompletedEvent extends GraphEvent {
  type: 'healing:scan_completed'
  payload: { issuesFound: number; bySeverity: Record<string, number> }
}

export interface HealingActionsExecutedEvent extends GraphEvent {
  type: 'healing:actions_executed'
  payload: { totalActions: number; successCount: number; failCount: number }
}

export interface HealingReportGeneratedEvent extends GraphEvent {
  type: 'healing:report_generated'
  payload: { reportId: string; successRate: number; totalIssues: number }
}

export interface SiebelSifImportedEvent extends GraphEvent {
  type: 'siebel:sif_imported'
  payload: { fileName: string; objectCount: number; dependencyCount: number; nodesCreated: number }
}

export interface SiebelComposerActionEvent extends GraphEvent {
  type: 'siebel:composer_action'
  payload: { action: string; envName: string; success: boolean; objectName?: string }
}

export interface SiebelObjectsIndexedEvent extends GraphEvent {
  type: 'siebel:objects_indexed'
  payload: { source: string; documentsIndexed: number }
}

export interface SiebelSifGeneratedEvent extends GraphEvent {
  type: 'siebel:sif_generated'
  payload: { objectCount: number; requestDescription: string; validationStatus: string }
}

export interface SprintPlannedEvent extends GraphEvent {
  type: 'sprint:planned'
  payload: { taskCount: number; velocity: number; capacity: number }
}

export interface ValidationCompletedEvent extends GraphEvent {
  type: 'validation:completed'
  payload: { nodeId?: string; action: string; passRate?: number }
}

export interface CodeReindexedEvent extends GraphEvent {
  type: 'code:reindexed'
  payload: { symbolCount: number; fileCount: number }
}

export interface KnowledgeQualityUpdatedEvent extends GraphEvent {
  type: 'knowledge:quality_updated'
  payload: { updated: number }
}

// ── Translation events ──────────────────────────────────

export interface TranslationJobCreatedEvent extends GraphEvent {
  type: 'translation:job_created'
  payload: { jobId: string; sourceLanguage: string; targetLanguage: string }
}

export interface TranslationAnalyzedEvent extends GraphEvent {
  type: 'translation:analyzed'
  payload: { jobId: string; constructCount: number; complexity: number }
}

export interface TranslationFinalizedEvent extends GraphEvent {
  type: 'translation:finalized'
  payload: { jobId: string; confidence: number; evidenceCount: number }
}

export interface TranslationErrorEvent extends GraphEvent {
  type: 'translation:error'
  payload: { jobId: string; errorMessage: string }
}

// ── Dream events ──────────────────────────────────

export interface DreamCycleStartedEvent extends GraphEvent {
  type: 'dream:cycle_started'
  payload: { cycleId: string; config: Record<string, unknown> }
}

export interface DreamPhaseStartedEvent extends GraphEvent {
  type: 'dream:phase_started'
  payload: { cycleId: string; phase: string }
}

export interface DreamPhaseCompletedEvent extends GraphEvent {
  type: 'dream:phase_completed'
  payload: { cycleId: string; phase: string; durationMs: number }
}

export interface DreamCycleCompletedEvent extends GraphEvent {
  type: 'dream:cycle_completed'
  payload: { cycleId: string; totalPruned: number; totalMerged: number; durationMs: number }
}

export interface DreamCycleFailedEvent extends GraphEvent {
  type: 'dream:cycle_failed'
  payload: { cycleId: string; errorMessage: string }
}

export interface HarnessScanCompletedEvent extends GraphEvent {
  type: 'harness:scan_completed'
  payload: { score: number; grade: string; timestamp: string }
}

export interface HarnessRegressionEvent extends GraphEvent {
  type: 'harness:regression_detected'
  payload: { before: number; after: number; delta: number }
}

// ── v11 Context-Pollination ──────────────────────────────────

export interface SubtaskArtifactCreatedEvent extends GraphEvent {
  type: 'subtask_artifact:created'
  payload: {
    artifactId: string
    nodeId: string
    epicId: string
    kind: 'diff' | 'file' | 'interface' | 'decision' | 'note'
    contentHash: string
    path: string | null
  }
}

// ── Sentrux integration (§EPIC-sentrux-adoption) ─────────────

export interface SentruxScanCompleteEvent extends GraphEvent {
  type: 'sentrux:scan_complete'
  payload: {
    runId: string
    issuesFound: number
    severity: 'ok' | 'warn' | 'error'
    timestamp: string
    details?: Record<string, unknown>
  }
}
