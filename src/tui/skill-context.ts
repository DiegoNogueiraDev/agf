/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SkillExecutionContext factory — cria o contexto injetavel para handlers de skill.
 */
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { TokenLedger } from '../core/autonomy/token-ledger.js'
import type { SkillExecutionContext, SkillStep } from './skill-handler-port.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/skill-context.ts' })

export interface SkillContextOptions {
  store: SqliteStore
  dir?: string
  testCmd?: string
  signal?: { readonly aborted: boolean }
}

/** Cria SkillExecutionContext com valores padrao. */
export function createSkillContext(opts: SkillContextOptions): SkillExecutionContext {
  log.debug('creating skill context')
  return {
    store: opts.store,
    dir: opts.dir ?? process.cwd(),
    testCmd: opts.testCmd ?? 'npm test',
    ledger: new TokenLedger(),
    onProgress: (_step: SkillStep) => {
      /* noop — substituido pelo TUI */
    },
    signal: opts.signal,
  }
}
