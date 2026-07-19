/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Hook System — allows plugins to register handlers on lifecycle events.
 * ADR-10: bridge over GraphEventBus with before/after semantics and abort().
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'hook-system.ts' })

export type HookPoint =
  | 'before:tool_call'
  | 'after:tool_call'
  | 'before:phase_transition'
  | 'after:phase_transition'
  | 'on:node_created'
  | 'on:node_updated'
  | 'on:spec_changed'
  | 'on:constitution_violated'
  | 'before:import'
  | 'after:import'

export interface HookContext {
  data: Record<string, unknown>
  abort: (reason: string) => void
  aborted: boolean
  abortReason: string | null
}

export interface HookRegistration {
  pluginName: string
  hookPoint: HookPoint
  priority: number
  handler: (context: HookContext) => void | Promise<void>
}

export interface HookExecutionResult {
  aborted: boolean
  abortReason: string | null
  errors: string[]
  hooksCalled: number
}

function isBeforeHook(hookPoint: HookPoint): boolean {
  return hookPoint.startsWith('before:')
}

export class HookSystem {
  private readonly hooks: Map<HookPoint, HookRegistration[]> = new Map()

  registerHook(registration: HookRegistration): void {
    const existing = this.hooks.get(registration.hookPoint) ?? []
    existing.push(registration)
    // Sort by priority (lower = earlier)
    existing.sort((a, b) => a.priority - b.priority)
    this.hooks.set(registration.hookPoint, existing)
    log.debug(
      `Hook registered: ${registration.pluginName} on ${registration.hookPoint} (priority ${registration.priority})`,
    )
  }

  async executeHooks(hookPoint: HookPoint, data: Record<string, unknown>): Promise<HookExecutionResult> {
    const registrations = this.hooks.get(hookPoint) ?? []
    const errors: string[] = []
    let aborted = false
    let abortReason: string | null = null
    let hooksCalled = 0

    const allowAbort = isBeforeHook(hookPoint)

    for (const reg of registrations) {
      if (aborted) break

      const context: HookContext = {
        data,
        aborted: false,
        abortReason: null,
        abort: (reason: string) => {
          if (allowAbort) {
            context.aborted = true
            context.abortReason = reason
            aborted = true
            abortReason = reason
          }
          // Silently ignore abort() on non-before hooks
        },
      }

      try {
        await reg.handler(context)
        hooksCalled++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(msg)
        hooksCalled++
        log.error(`Hook error: ${reg.pluginName} on ${hookPoint}`, { error: msg })
        // Continue — error boundary
      }
    }

    return { aborted, abortReason, errors, hooksCalled }
  }

  removeHooks(pluginName: string): void {
    for (const [hookPoint, registrations] of this.hooks) {
      const filtered = registrations.filter((r) => r.pluginName !== pluginName)
      if (filtered.length === 0) {
        this.hooks.delete(hookPoint)
      } else {
        this.hooks.set(hookPoint, filtered)
      }
    }
    log.debug(`Hooks removed for plugin: ${pluginName}`)
  }

  listHooks(): Array<{ pluginName: string; hookPoint: HookPoint; priority: number }> {
    const resultValue: Array<{ pluginName: string; hookPoint: HookPoint; priority: number }> = []
    for (const [, registrations] of this.hooks) {
      for (const reg of registrations) {
        resultValue.push({ pluginName: reg.pluginName, hookPoint: reg.hookPoint, priority: reg.priority })
      }
    }
    return resultValue
  }
}
