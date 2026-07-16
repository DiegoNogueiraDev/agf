/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LifecycleGate — re-export do domínio em src/core/orchestrator/lifecycle-gate.ts.
 * Mantido para compatibilidade com imports existentes.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/lifecycle-gate.ts' })
log.info('lifecycle-gate loaded')

export { LIFECYCLE_PHASES, getNextPhase, getPrereqs, type GateResult } from '../core/orchestrator/lifecycle-gate.js'
