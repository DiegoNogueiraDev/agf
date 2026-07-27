/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Modelo de visão da TUI (M1p) — re-export do domínio em src/core/web/model.ts.
 * Mantido para compatibilidade com imports existentes.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/model.ts' })
log.info('model loaded')

export {
  type TaskLine,
  type TokenSummaryLine,
  type DashboardModel,
  type DashboardInput,
  type CanonicalPhase,
  buildDashboardModel,
  loadDashboardModel,
} from '../core/web/model.js'
