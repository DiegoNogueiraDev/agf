/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * import-hooks — pontos de extensão do pipeline de import (T4.3). Plugins
 * registram em `before:import` (pode abortar) e `after:import` (recebe o
 * resultado) via {@link importHookSystem}; o comando `import-prd` dispara
 * ambos com {@link fireBeforeImport} / {@link fireAfterImport}.
 *
 * Singleton compartilhado: o pipeline de import (CLI) e os plugins falam com a
 * mesma instância. Sem handlers registrados, os disparos são no-op seguros.
 */
import { HookSystem, type HookExecutionResult } from './hook-system.js'

/** Sistema de hooks compartilhado do pipeline de import. */
export const importHookSystem = new HookSystem()

/** Dispara `before:import` — handlers podem abortar (ver `result.aborted`). */
export function fireBeforeImport(data: Record<string, unknown>): Promise<HookExecutionResult> {
  return importHookSystem.executeHooks('before:import', data)
}

/** Dispara `after:import` com o resultado do import (não abortável). */
export function fireAfterImport(data: Record<string, unknown>): Promise<HookExecutionResult> {
  return importHookSystem.executeHooks('after:import', data)
}
