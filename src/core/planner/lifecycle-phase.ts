/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Barrel re-export for lifecycle phase logic.
 * WHY here: all consumers import from 'lifecycle-phase.js' — this barrel preserves
 * that public surface while the implementation is split across focused sub-modules:
 *   - lifecycle-phase-types.ts   — shared types and constants (zero deps)
 *   - lifecycle-phase-modes.ts   — guidance data and mode mappings
 *   - lifecycle-phase-gates.ts   — gate enforcement (phase/tool/status/prerequisite)
 *   - lifecycle-phase-rules.ts   — detection rules and anti-pattern warnings
 */

export * from './lifecycle-phase-types.js'
export * from './lifecycle-phase-modes.js'
export * from './lifecycle-phase-gates.js'
export * from './lifecycle-phase-rules.js'
