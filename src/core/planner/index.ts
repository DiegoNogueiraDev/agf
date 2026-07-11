/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'planner/index.ts' })

export { TaskPrefetcher } from './task-prefetcher.js'
export type { PrefetchedContext, PrefetchStats, PrefetchOptions } from './task-prefetcher.js'
export { analyzeAutoReady } from './auto-ready.js'
export type { AutoReadyReport } from './auto-ready.js'
export { detectLargeTasks } from './decompose.js'
export type { DecomposeResult, SuggestedSubtask } from './decompose.js'
export { findTransitiveBlockers, detectCycles, findCriticalPath } from './dependency-chain.js'
export { findNextTask } from './next-task.js'
export type { NextTaskResult, NextTaskOptions } from './next-task.js'
export { smartDecompose } from './smart-decompose.js'
export type { DecomposedSubtask, DecomposedEdge } from './smart-decompose.js'
export { analyzeSprintHealth } from './sprint-health.js'
export type { SprintHealthReport } from './sprint-health.js'
export { calculateVelocity } from './velocity.js'
export type { SprintVelocity, VelocityTask, CategoryVelocity, VelocitySummary } from './velocity.js'
export { checkTddEnforcement, DEFAULT_DECLARATIVE_WHITELIST } from './tdd-enforcement.js'
export type { TddEnforcementContext, TddEnforcementResult, CommitInfo } from './tdd-enforcement.js'
