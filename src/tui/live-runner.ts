/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Porta de execução ao vivo da TUI (M1r) — abstrai rodar o autopilot/`run` no
 * processo, emitindo linhas de progresso (por-step) via `onLine` e devolvendo um
 * resumo final. Injetável: a TUI fica testável com um runner fake (sem SDK/store).
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/live-runner.ts' })
log.info('live-runner loaded')

export interface LiveRunner {
  /**
   * Roda o loop autônomo até `maxIterations`; emite linhas por-step; resolve com
   * resumo. `signal` opcional permite cancelamento cooperativo (Esc na TUI).
   */
  autopilot(
    maxIterations: number,
    onLine: (line: string) => void,
    signal?: { readonly aborted: boolean },
  ): Promise<string>
  /** Implementa um prompt ad-hoc (one-shot); emite linhas; resolve com resumo. */
  run(prompt: string, onLine: (line: string) => void): Promise<string>
}
