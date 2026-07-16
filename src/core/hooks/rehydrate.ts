/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import type { HookRegistry } from './hook-registry.js'
import type { HookHandler, HookEvent } from './hook-types.js'
import type { HookHandlerConfig } from './config-loader.js'
import { loadHookConfig, type LoadHookConfigOptions } from './config-loader.js'
import { HookHandlersStore } from './hook-handlers-store.js'
import { runShellHandler } from './shell-handler.js'
import { createLogger } from '../utils/logger.js'
import { OperationError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'rehydrate.ts' })

/**
 * Convert a persisted/configured HookHandlerConfig into a runtime
 * HookHandler closure suitable for HookRegistry.register().
 *
 * Currently supports kind=shell. kind=inline-unsafe configs are skipped
 * with a warning — inline JS shouldn't live in persistent storage.
 */
export function configToHandler(config: HookHandlerConfig): HookHandler | null {
  if (config.kind !== 'shell') {
    log.warn('hooks:rehydrate:skip', {
      id: config.id,
      kind: config.kind,
      reason: 'only kind=shell is rehydratable in v1',
    })
    return null
  }
  if (!config.command) {
    log.warn('hooks:rehydrate:skip', { id: config.id, reason: 'shell handler missing command' })
    return null
  }
  return async (event: HookEvent): Promise<void> => {
    const resultValue = await runShellHandler(
      {
        id: config.id,
        command: config.command as string,
        args: config.commandArgs,
        env: config.env,
        timeoutMs: config.timeoutMs,
      },
      event,
    )
    if (resultValue.decision === 'block') {
      throw new OperationError(resultValue.stderr || `hook "${config.id}" blocked`)
    }
    if (resultValue.decision === 'warn') {
      log.warn('hooks:rehydrated:warn', {
        id: config.id,
        exitCode: resultValue.exitCode,
        timedOut: resultValue.timedOut,
      })
    }
  }
}

export interface RehydrateOptions extends LoadHookConfigOptions {
  /** When true, also rehydrate from the DB store. */
  fromStore?: boolean
  /** When true, also rehydrate from config files. */
  fromConfig?: boolean
}

export interface RehydrateResult {
  registered: string[]
  skipped: Array<{ id: string; reason: string }>
}

/**
 * Hydrate the registry with persisted + configured handlers. Safe to call
 * during boot before the first tool dispatch.
 */
export function rehydrateHooks(
  registry: HookRegistry,
  db: Database.Database | null,
  options: RehydrateOptions = {},
): RehydrateResult {
  const { fromStore = true, fromConfig = true } = options
  const registered: string[] = []
  const skipped: RehydrateResult['skipped'] = []

  const seen = new Set<string>()
  const consume = (config: HookHandlerConfig, _origin: string): void => {
    if (seen.has(config.id)) return
    seen.add(config.id)
    const handler = configToHandler(config)
    if (!handler) {
      skipped.push({ id: config.id, reason: `kind=${config.kind} not rehydratable` })
      return
    }
    registry.register({
      id: config.id,
      channel: config.channel,
      handler,
      priority: config.priority ?? 0,
    })
    registered.push(config.id)
  }

  // Config files first → DB last so DB values win (most recent runtime state).
  if (fromConfig) {
    const merged = loadHookConfig(options)
    for (const handler of merged.handlers) consume(handler, 'config')
  }
  if (fromStore && db) {
    const store = new HookHandlersStore(db)
    for (const handler of store.list()) {
      // DB values override config (later seen wins requires re-registering)
      seen.delete(handler.id)
      consume(handler, 'db')
    }
  }

  if (registered.length > 0) {
    log.info('hooks:rehydrate:ok', { count: registered.length, skipped: skipped.length })
  }
  return { registered, skipped }
}
