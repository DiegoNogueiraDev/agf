/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Barrel — re-exports all graph algorithm families.
 * WHY here: single import point for callers; family files own the logic.
 * Composing: helpers → traversal/shortest-path/spanning-tree/flow/centrality → this barrel.
 */

export type { AdjList, AdjMatrix } from './graph-algorithms-helpers.js'
export type { CriticalPathResult, ShortestPathResult } from './graph-algorithms-shortest-path.js'
export type { MinimumSpanningTreeResult } from './graph-algorithms-spanning-tree.js'
export type { AssignmentResult } from './graph-algorithms-flow.js'

export * from './graph-algorithms-traversal.js'
export * from './graph-algorithms-shortest-path.js'
export * from './graph-algorithms-spanning-tree.js'
export * from './graph-algorithms-flow.js'
export * from './graph-algorithms-centrality.js'
