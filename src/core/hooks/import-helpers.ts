/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { HookHandlerConfig, AgentSource } from './config-loader.js'
import type { HookChannel } from './hook-types.js'
import { OperationError } from '../utils/errors.js'
import { makeHookId } from './hook-id-scheme.js'

/**
 * Multi-CLI PRD Sprint M0 — shared importer primitives.
 *
 * Each provider's importer (claude-code, codex, opencode, copilot, ...)
 * delegates the boilerplate parts here:
 *  1. file existence + read + parse (json | yaml | toml)
 *  2. ID generation per (provider, event, blockIdx, hookIdx)
 *  3. result envelope shape (imported / skipped / source / provider)
 *
 * Each provider only declares its own:
 *  - aliases map (raw event name → mcp-graph HookChannel | null)
 *  - blockExtractor (settings → array of blocks)
 *  - handlerGenerator (block + matcher → HookHandlerConfig)
 */

export type SettingsParser = 'json' | 'yaml' | 'toml'

export type ReadResult<T> = { ok: true; data: T } | { ok: false; reason: string }

export interface ImportEnvelope {
  imported: HookHandlerConfig[]
  skipped: Array<{ event: string; reason: string }>
  source: string
  provider: AgentSource
}

/**
 * Read + parse a settings file. Returns a discriminated union so the
 * caller can decide whether "file not found" is fatal or just an empty
 * import (most importers treat it as empty).
 */
export function readSettingsFile<T = unknown>(path: string, parser: SettingsParser): ReadResult<T> {
  if (!existsSync(path)) return { ok: false, reason: `source not found: ${path}` }
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (err) {
    return { ok: false, reason: `read error: ${err instanceof Error ? err.message : String(err)}` }
  }
  try {
    const dataValue = parseRaw<T>(raw, parser)
    return { ok: true, data: dataValue }
  } catch (err) {
    return { ok: false, reason: `parse error (${parser}): ${err instanceof Error ? err.message : String(err)}` }
  }
}

function parseRaw<T>(raw: string, parser: SettingsParser): T {
  if (parser === 'json') return JSON.parse(raw) as T
  if (parser === 'yaml') return parseYaml(raw) as T
  if (parser === 'toml') return parseToml(raw) as T
  throw new OperationError(`unsupported parser: ${String(parser)}`)
}

/**
 * Minimal TOML subset parser. Handles the structures used by Codex
 * (`[hooks]`, `[mcp_servers.<name>]`) and OpenCode (`[hooks]`,
 * `[plugins]`) — bare key/value pairs, string/int/bool/array literals,
 * dotted-table headers. Comments via `#`.
 *
 * Deliberately not a full TOML implementation: complex types
 * (multi-line strings, datetime, arrays-of-tables) are out of scope.
 * Provider importers that hit them can fall back to a real parser
 * library or report the field as `skipped`.
 */
export function parseToml(raw: string): Record<string, unknown> {
  const resultValue: Record<string, unknown> = {}
  let currentTable: Record<string, unknown> = resultValue
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      const headerInner = line.slice(1, -1)
      currentTable = navigateOrCreate(resultValue, headerInner.split('.'))
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const valueRaw = stripInlineComment(line.slice(eq + 1)).trim()
    currentTable[key] = parseTomlValue(valueRaw)
  }
  return resultValue
}

function navigateOrCreate(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let cur = root
  for (const part of path) {
    const next = cur[part]
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      cur = next as Record<string, unknown>
    } else {
      const fresh: Record<string, unknown> = {}
      cur[part] = fresh
      cur = fresh
    }
  }
  return cur
}

function stripInlineComment(s: string): string {
  // Avoid stripping inside strings: simple heuristic — only strip # outside quotes.
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === '#' && !inSingle && !inDouble) return s.slice(0, i)
  }
  return s
}

function parseTomlValue(raw: string): unknown {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => parseTomlValue(item.trim()))
  }
  const num = Number(raw)
  if (!Number.isNaN(num)) return num
  return raw
}

/**
 * Generate a deterministic, collision-resistant handler id per
 * (provider, event, blockIdx, hookIdx). Lowercased event name keeps it
 * readable. Used by every provider importer.
 */
export function generateHandlerId(
  provider: AgentSource | 'shell-hook',
  event: string,
  blockIdx: number,
  hookIdx: number,
): string {
  const safeEvent = event.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
  // hook-id-scheme.ts's canonical, validated, round-trippable id format
  // (`${cli}-${event}-${groupIndex}-${hookIndex}`) — same shape this function
  // built inline before. makeHookId's `cli` part rejects dashes, so the
  // 'shell-hook' provider literal (unused by any real caller today) falls
  // back to the original manual format rather than throwing.
  try {
    return makeHookId({ cli: provider, event: safeEvent, groupIndex: blockIdx, hookIndex: hookIdx })
  } catch {
    return `${provider}-${safeEvent}-${blockIdx}-${hookIdx}`
  }
}

export interface WalkBlocksContext<TBlock, THook> {
  provider: AgentSource
  aliases: Record<string, HookChannel | null>
  /** Extract the raw event-name → blocks[] map from parsed settings. */
  blocksByEvent: Record<string, TBlock[]>
  /** Given a block, return its inner hook entries. */
  blockHooks(block: TBlock): THook[]
  /** Optional matcher string from a block (e.g. Claude Code's `block.matcher`). */
  blockMatcher?(block: TBlock): string | undefined
  /** Convert a single (event, channel, matcher, hook) into a HookHandlerConfig. */
  toHandler(
    event: string,
    channel: HookChannel,
    matcher: string | undefined,
    hook: THook,
    blockIdx: number,
    hookIdx: number,
  ): HookHandlerConfig | { skip: string }
}

/**
 * Generic walk over `event → blocks → hooks`. Resolves event names via
 * aliases (skip if null), invokes toHandler for each hook entry,
 * returns the standard ImportEnvelope. Each provider importer becomes
 * ~20 lines wrapped around this.
 */
export function walkEventBlocks<TBlock, THook>(ctx: WalkBlocksContext<TBlock, THook>, source: string): ImportEnvelope {
  const envelope: ImportEnvelope = {
    imported: [],
    skipped: [],
    source,
    provider: ctx.provider,
  }
  for (const [event, blocks] of Object.entries(ctx.blocksByEvent)) {
    const channel = ctx.aliases[event]
    if (channel == null) {
      envelope.skipped.push({ event, reason: channel === null ? 'no mcp-graph analog' : `unknown event: ${event}` })
      continue
    }
    if (!Array.isArray(blocks)) continue
    blocks.forEach((block, blockIdx) => {
      const hooks = ctx.blockHooks(block)
      const matcher = ctx.blockMatcher?.(block)
      hooks.forEach((hook, hookIdx) => {
        const rVar = ctx.toHandler(event, channel, matcher, hook, blockIdx, hookIdx)
        if ('skip' in rVar) {
          envelope.skipped.push({ event, reason: `block ${blockIdx}.${hookIdx}: ${rVar.skip}` })
          return
        }
        envelope.imported.push(rVar)
      })
    })
  }
  return envelope
}
