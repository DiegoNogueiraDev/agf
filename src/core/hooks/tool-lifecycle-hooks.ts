/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-claw-hooks — E7-T2: Per-tool lifecycle hook registry + execution.
 *
 * Provides PreToolUse / PostToolUse / PostToolUseFailure hooks for individual
 * MCP tools or wildcards ("*"). Shell commands receive JSON input via stdin
 * and return HookResult via stdout (injectable for testing — ToolHookShellFn).
 *
 * Semantics:
 *   - PreToolUse: allow:false → short-circuits (tool does not execute)
 *   - PreToolUse: updatedInput → passed to handler instead of original input
 *   - Hooks run in registration order; first allow:false wins (short-circuit)
 *   - Shell failure is advisory: logged as warning, execution continues
 */

import { createLogger } from '../utils/logger.js'
import type { ToolHookConfig, HookResult } from '../../schemas/tool-hook.schema.js'

const log = createLogger({ layer: 'core', source: 'tool-lifecycle-hooks.ts' })

export type ToolHookShellFn = (command: string, input: unknown) => Promise<HookResult>

type ToolHookEvent = ToolHookConfig['event']

interface RegisteredHook {
  config: ToolHookConfig
}

/**
 * Per-tool lifecycle hook registry.
 * Injectable shell function enables testing without real shell execution.
 */
export class ToolLifecycleHooks {
  private readonly hooks: RegisteredHook[] = []

  constructor(private readonly shellFn: ToolHookShellFn = buildDefaultShellFn()) {}

  register(config: ToolHookConfig): void {
    this.hooks.push({ config })
    log.debug('tool-lifecycle:hook:registered', { tool: config.tool, event: config.event })
  }

  async runPreToolUse(toolName: string, input: unknown): Promise<HookResult> {
    return this.runHooks('PreToolUse', toolName, { toolName, input })
  }

  async runPostToolUse(toolName: string, result: unknown): Promise<HookResult> {
    await this.runHooks('PostToolUse', toolName, { toolName, result })
    return { allow: true }
  }

  async runPostToolUseFailure(toolName: string, error: Error): Promise<void> {
    await this.runHooks('PostToolUseFailure', toolName, { toolName, error: error.message })
  }

  private async runHooks(event: ToolHookEvent, toolName: string, payload: unknown): Promise<HookResult> {
    const matching = this.hooks.filter(
      (h) => h.config.event === event && (h.config.tool === '*' || h.config.tool === toolName),
    )

    if (matching.length === 0) return { allow: true }

    const warnings: string[] = []
    let updatedInput: unknown

    for (const hook of matching) {
      let result: HookResult
      try {
        result = await this.shellFn(hook.config.command, payload)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn('tool-lifecycle:hook:shell:fail', { tool: toolName, event, error: msg })
        warnings.push(msg)
        continue
      }

      if (result.warnings?.length) warnings.push(...result.warnings)
      if (result.updatedInput !== undefined) updatedInput = result.updatedInput

      if (!result.allow) {
        return { allow: false, warnings: warnings.length ? warnings : undefined }
      }
    }

    return {
      allow: true,
      ...(updatedInput !== undefined ? { updatedInput } : {}),
      ...(warnings.length ? { warnings } : {}),
    }
  }
}

/**
 * Default shell function — executes the command with JSON stdin, reads stdout as HookResult.
 * Uses the real shell-handler pattern for production use.
 */
function buildDefaultShellFn(): ToolHookShellFn {
  return async (command: string, input: unknown): Promise<HookResult> => {
    const { spawn } = await import('node:child_process')

    return new Promise((resolve) => {
      const parts = command.split(' ')
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §pre-existing: split always yields at least one element
      const cmd = parts[0]!
      const args = parts.slice(1)

      const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      const stdinData = JSON.stringify(input)
      let stdout = ''

      child.stdin.write(stdinData)
      child.stdin.end()

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout.trim()) as HookResult
            resolve(parsed)
            return
          } catch (err) {
            log.warn('hook:json-parse-failed', { err: String(err) })
          }
        }
        resolve({ allow: true })
      })
      child.on('error', () => resolve({ allow: true }))
    })
  }
}

export type { ToolHookConfig, HookResult }
