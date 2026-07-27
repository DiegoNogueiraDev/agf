/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Enforcement handlers for the hook system (M7).
 *
 * Registers deterministic gates on hook channels to prevent models from
 * marking tasks done without real implementation.
 *
 * Gate 1: status:pre-change — deny backlog→done (must go through in_progress)
 *
 * This handler is registered globally at CLI startup so it protects
 * ALL status transition paths (agf done, store.updateNodeStatus, etc.).
 *
 * Kill-switch: AGF_HOOKS=0 bypasses all enforcement.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerHook, type RegisteredHookHandler } from './register-hook.js'
import { deny, allow, type HookEvent } from './hook-types.js'
import { loadHookTomlConfig, HookTomlConfigError } from './hook-toml-config.js'
import { loadHookConfig } from './config-loader.js'
import { configToHandler } from './rehydrate.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'enforcement-handlers.ts' })

/**
 * Register all enforcement handlers at CLI startup.
 */
export function registerEnforcementHandlers(dir: string = process.cwd()): void {
  registerStatusFlowEnforcement()
  registerProjectTomlHooks(dir)
  registerProjectJsonHooks(dir)
}

/**
 * Task 3.1 — declarative TOML hooks: `.mcp-graph/hooks.toml`, one [[hook]]
 * block per shell-command handler. Absent file (the common case) is a
 * silent no-op; invalid TOML/schema logs a warning and skips rather than
 * crashing CLI startup.
 */
function registerProjectTomlHooks(dir: string): void {
  const path = join(dir, '.mcp-graph', 'hooks.toml')
  if (!existsSync(path)) return
  try {
    const toml = readFileSync(path, 'utf-8')
    const { count } = loadHookTomlConfig(toml)
    log.info('hooks:toml:registered', { path, count })
  } catch (err) {
    const reason = err instanceof HookTomlConfigError ? err.message : err instanceof Error ? err.message : String(err)
    log.warn('hooks:toml:invalid', { path, reason })
  }
}

/**
 * Load .mcp-graph/hooks.json (user + project + local, later wins) and register
 * each kind=shell entry into the real, connected registry (register-hook.ts).
 *
 * WHY: this file is the ACTUAL persistence target of every `agf hooks import-*`
 * provider command (aider/codex/copilot/opencode/claude-code) plus `agf hooks
 * add` — but until this wire, nothing at CLI startup ever loaded it back into
 * a live registry, so every imported hook was persisted and never activated.
 * Reuses configToHandler (rehydrate.ts) — a pure config->closure converter
 * that doesn't depend on the disconnected HookRegistry class it was written
 * alongside; adapted here to the RegisteredHookHandler action-model contract
 * that register-hook.ts's dispatch actually understands.
 */
function registerProjectJsonHooks(dir: string): void {
  const { handlers } = loadHookConfig({ cwd: dir })
  let count = 0
  for (const config of handlers) {
    const handler = configToHandler(config)
    if (!handler) continue
    registerHook(
      config.channel,
      (async (event: HookEvent) => {
        try {
          await handler(event)
          return allow()
        } catch (err) {
          return deny(err instanceof Error ? err.message : String(err))
        }
      }) as RegisteredHookHandler,
      { priority: config.priority ?? 0, id: config.id },
    )
    count++
  }
  if (count > 0) log.info('hooks:json:registered', { dir, count })
}

/**
 * Gate 1: status:pre-change — deny backlog→done and ready→done.
 *
 * A task MUST pass through in_progress before being marked done.
 * This is the primary hallucination guard: prevents models from
 * skipping TDD and jumping directly to done.
 *
 * When a legitimate skip-test scenario exists (e.g. importing
 * already-completed work), use --force on agf node status.
 */
function registerStatusFlowEnforcement(): void {
  registerHook(
    'status:pre-change',
    ((event: HookEvent) => {
      const { from, to } = event.payload as { from?: string; to?: string }
      if (to === 'done' && from !== 'in_progress' && from !== 'done') {
        return deny(
          `Status flow violation: "${from}"→"done" blocked. ` +
            `Tasks must go through in_progress first (TDD: RED→GREEN→REFACTOR). ` +
            `Use "agf node status <id> in_progress" first, or --force to bypass.`,
        )
      }
      return undefined
    }) as RegisteredHookHandler,
    { priority: 0, id: 'enforce-status-flow' },
  )
}
