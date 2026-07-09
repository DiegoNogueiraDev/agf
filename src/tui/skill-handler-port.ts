/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SkillHandlerPort — interface para execucao de skills via slash commands.
 * Skills implementam execute() com progresso granular e contexto compartilhado.
 */
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { TokenLedger } from '../core/autonomy/token-ledger.js'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/skill-handler-port.ts' })
log.info('skill-handler-port loaded')

export interface SkillStep {
  step: number
  total: number
  label: string
  elapsedMs: number
  tokensUsed: number
}

export interface SkillExecutionContext {
  store: SqliteStore
  dir: string
  testCmd: string
  ledger: TokenLedger
  onProgress: (step: SkillStep) => void
  signal?: { readonly aborted: boolean }
}

export interface SkillHandlerPort {
  /** Executa a skill com os argumentos e contexto. Retorna resumo textual. */
  execute(args: string, ctx: SkillExecutionContext): Promise<string>
}

export interface SlashCommandSkill {
  name: string
  usage: string
  desc: string
  phase: string
  handler?: SkillHandlerPort
  dependsOn?: string[]
}
