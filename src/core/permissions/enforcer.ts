/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-E2 — claw-clone CLI / Task E2.2
 *
 * Permission enforcer. Pure function — no I/O, no logging. The agent driver
 * (E2.9) calls `enforce(mode, ctx)` before dispatching any tool whose
 * capability mutates state or escapes the workspace.
 *
 * Three modes (mirror claw):
 *   - read-only          → block write/shell/network (read allowed)
 *   - workspace-write    → allow everything inside cwd subtree (default)
 *   - danger-full-access → unrestricted
 *
 * `allowedTools` is an explicit allowlist that overrides denial — used by
 * `--allowedTools read,bash,glob` so users can selectively widen a strict
 * mode without dropping to danger-full-access.
 */

import { resolve, sep } from 'node:path'
import type { PermissionMode } from '../worker-state/worker-state-schema.js'

export type ToolCapability = 'read' | 'write' | 'shell' | 'network'

export interface EnforceContext {
  capability: ToolCapability
  /** Tool identifier (used for allowedTools allowlist matching). */
  toolName?: string
  /** Workspace root — required to enforce workspace-write boundary. */
  cwd?: string
  /** Absolute path the tool would write to — required to enforce boundary. */
  targetPath?: string
  /** Allowlist (overrides denials by mode). */
  allowedTools?: ReadonlyArray<string>
}

export type EnforceVerdict = { verdict: 'allow' } | { verdict: 'deny'; reason: string }

function isPathInside(parent: string, child: string): boolean {
  const p = resolve(parent)
  const c = resolve(child)
  if (c === p) return true
  const prefix = p.endsWith(sep) ? p : p + sep
  return c.startsWith(prefix)
}

function allowlistMatches(ctx: EnforceContext): boolean {
  if (!ctx.toolName || !ctx.allowedTools) return false
  return ctx.allowedTools.includes(ctx.toolName)
}

export function enforce(mode: PermissionMode, ctx: EnforceContext): EnforceVerdict {
  // Allowlist short-circuits everything except a path-traversal guard, which
  // we still apply in workspace-write below.
  if (mode === 'danger-full-access') return { verdict: 'allow' }

  if (mode === 'read-only') {
    if (ctx.capability === 'read') return { verdict: 'allow' }
    if (allowlistMatches(ctx)) return { verdict: 'allow' }
    return {
      verdict: 'deny',
      reason: `permission_mode=read-only blocks ${ctx.capability}`,
    }
  }

  // workspace-write
  if (ctx.capability === 'read') return { verdict: 'allow' }
  if (ctx.capability === 'shell' || ctx.capability === 'network') {
    return { verdict: 'allow' }
  }
  // capability === "write"
  if (ctx.cwd && ctx.targetPath) {
    if (!isPathInside(ctx.cwd, ctx.targetPath)) {
      if (allowlistMatches(ctx)) return { verdict: 'allow' }
      return {
        verdict: 'deny',
        reason: `write targets ${ctx.targetPath}, outside workspace boundary ${ctx.cwd}`,
      }
    }
  }
  return { verdict: 'allow' }
}
