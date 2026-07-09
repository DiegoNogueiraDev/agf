/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */
import { RAW_CAP, MIN_COMPRESS_SIZE } from './constants.js'
import { autoDetectFilter } from './autodetect.js'
import { safeApply } from './apply-filter.js'
import { recordMiss } from './discover.js'
import { ensureCustomFiltersLoaded } from './custom-filters.js'
import { teeRawOutput } from './tee.js'

export interface CompressStats {
  bytesBefore: number
  bytesAfter: number
  hits: Array<{ shape: string; filter: string; saved: number }>
}

// ── Re-exports — tool-compress public API ──────────────────────────────────────

// constants
export {
  RAW_CAP,
  MIN_COMPRESS_SIZE,
  DETECT_WINDOW,
  GIT_DIFF_HUNK_MAX_LINES,
  GIT_DIFF_CONTEXT_KEEP,
  DEDUP_LINE_MAX,
  GREP_PER_FILE_MAX,
  FIND_PER_DIR_MAX,
  FIND_TOTAL_DIR_MAX,
  STATUS_MAX_FILES,
  STATUS_MAX_UNTRACKED,
  LS_EXT_SUMMARY_TOP,
  LS_NOISE_DIRS,
  TREE_MAX_LINES,
  SEARCH_LIST_PER_DIR_MAX,
  SEARCH_LIST_TOTAL_DIR_MAX,
  SMART_TRUNCATE_HEAD,
  SMART_TRUNCATE_TAIL,
  SMART_TRUNCATE_MIN_LINES,
  READ_NUMBERED_MIN_HIT_RATIO,
  TEST_RUNNER_MAX_KEEP,
  LINT_REPORT_TOP_LOCATIONS,
  FILTERS,
} from './constants.js'

// registry
export {
  autoDetectFilter,
  registerFilter,
  clearCustomFilters,
  listFilters,
  detectFilter,
  type FilterFn,
  type DetectCtx,
  type CompressFilter,
} from './registry.js'

// apply-filter
export { safeApply } from './apply-filter.js'

// custom-filters
export {
  compileCustomFilter,
  loadCustomFiltersFromFile,
  ensureCustomFiltersLoaded,
  _resetCustomFiltersLoaded,
  type CustomFilterRule,
} from './custom-filters.js'

// discover
export {
  discoverEnabled,
  signatureOf,
  recordMiss,
  topMisses,
  resetDiscover,
  persistDiscover,
  loadDiscover,
  formatDiscover,
  scanLedgerForMissedFilters,
  formatLedgerDiscover,
  type DiscoverRecord,
  type LedgerDiscoverRecord,
} from './discover.js'

// tee
export { teeRawOutput, teePointer, type TeeResult } from './tee.js'

// toml-pipeline
export { applyTomlPipeline, type TomlPipelineStage } from './toml-pipeline.js'

// filter-overrides
export {
  ensureFilterOverridesLoaded,
  _resetFilterOverrides,
  loadFilterOverridesFromFile,
  type TomlFilterEntry,
} from './filter-overrides.js'

// builtin-filters
export { loadBuiltinTomlFilters, _resetBuiltinFilters } from './builtin-filters.js'

/** Apply all registered compression filters to a chat request body. Returns null when disabled or body is empty. Loads custom filters from AGF_COMPRESS_FILTERS on first call. */
export function compressMessages(
  body: Record<string, unknown> | null | undefined,
  enabled: boolean,
): CompressStats | null {
  if (!enabled) return null
  if (!body) return null
  ensureCustomFiltersLoaded() // carrega filtros declarativos de AGF_COMPRESS_FILTERS (1x)

  if (body.conversationState) {
    return compressKiroFormat(body, enabled)
  }

  const items: Array<Record<string, unknown>> | null = Array.isArray(body.messages)
    ? (body.messages as Array<Record<string, unknown>>)
    : Array.isArray(body.input)
      ? (body.input as Array<Record<string, unknown>>)
      : null
  if (!items) return null

  const stats: CompressStats = { bytesBefore: 0, bytesAfter: 0, hits: [] }
  try {
    for (let i = 0; i < items.length; i++) {
      const msg = items[i]
      if (!msg) continue

      if (msg.type === 'function_call_output') {
        if (typeof msg.output === 'string') {
          msg.output = compressText(msg.output as string, stats, 'openai-responses-string')
        } else if (Array.isArray(msg.output)) {
          for (let k = 0; k < (msg.output as Array<Record<string, unknown>>).length; k++) {
            const part = (msg.output as Array<Record<string, unknown>>)[k]
            if (part && part.type === 'input_text' && typeof part.text === 'string') {
              part.text = compressText(part.text, stats, 'openai-responses-array')
            }
          }
        }
        continue
      }

      if (msg.role === 'tool' && typeof msg.content === 'string') {
        msg.content = compressText(msg.content as string, stats, 'openai-tool')
        continue
      }

      // agent-driver convention: tool results are surfaced as a user-role
      // message tagged `[tool:NAME id=ID]\n<output>`. OK results carry the
      // raw output after a newline; ERROR/DENIED results are a single tagged
      // line (no newline) and are left intact, mirroring is_error handling.
      if (msg.role === 'user' && typeof msg.content === 'string' && (msg.content as string).startsWith('[tool:')) {
        const c = msg.content as string
        const nlIdx = c.indexOf('\n')
        if (nlIdx !== -1) {
          const tag = c.slice(0, nlIdx)
          const body = c.slice(nlIdx + 1)
          const compressed = compressText(body, stats, 'agent-tool-result')
          if (compressed.length < body.length) {
            msg.content = `${tag}\n${compressed}`
          }
        }
        continue
      }

      if (!Array.isArray(msg.content)) continue

      if (msg.role === 'tool') {
        const content = msg.content as Array<Record<string, unknown>>
        for (let k = 0; k < content.length; k++) {
          const part = content[k]
          if (part && part.type === 'text' && typeof part.text === 'string') {
            part.text = compressText(part.text, stats, 'openai-tool-array')
          }
        }
        continue
      }

      for (let j = 0; j < (msg.content as Array<Record<string, unknown>>).length; j++) {
        const block = (msg.content as Array<Record<string, unknown>>)[j]
        if (!block || block.type !== 'tool_result') continue
        if (block.is_error === true) continue

        if (typeof block.content === 'string') {
          block.content = compressText(block.content as string, stats, 'claude-string')
        } else if (Array.isArray(block.content)) {
          for (let k = 0; k < (block.content as Array<Record<string, unknown>>).length; k++) {
            const part = (block.content as Array<Record<string, unknown>>)[k]
            if (part && part.type === 'text' && typeof part.text === 'string') {
              part.text = compressText(part.text, stats, 'claude-array')
            }
          }
        }
      }
    }
  } catch {
    return null
  }
  return stats
}

function compressKiroFormat(body: Record<string, unknown>, _enabled: boolean): CompressStats | null {
  const stats: CompressStats = { bytesBefore: 0, bytesAfter: 0, hits: [] }
  try {
    const state = body.conversationState as Record<string, unknown> | undefined
    const allMessages: Array<Record<string, unknown>> = [
      ...(Array.isArray(state?.history) ? (state.history as Array<Record<string, unknown>>) : []),
    ]
    if (state?.currentMessage) allMessages.push(state.currentMessage as Record<string, unknown>)

    for (const msg of allMessages) {
      const toolResults = (msg as Record<string, unknown>).userInputMessage as Record<string, unknown> | undefined
      const results = toolResults?.userInputMessageContext as Record<string, unknown> | undefined
      const tr = Array.isArray(results?.toolResults) ? (results.toolResults as Array<Record<string, unknown>>) : []
      if (tr.length === 0) continue

      for (const toolResult of tr) {
        if (toolResult.status === 'error') continue
        const content = Array.isArray(toolResult.content) ? (toolResult.content as Array<Record<string, unknown>>) : []
        for (const part of content) {
          if (part && typeof part.text === 'string') {
            part.text = compressText(part.text, stats, 'kiro-tool-result')
          }
        }
      }
    }
  } catch {
    return null
  }
  return stats
}

/**
 * Compress a single tool-output string, losslessly by design: auto-detect the
 * shape, apply the matching filter, and revert to the original whenever the
 * filter errors, yields nothing, or grows the output. On failure, the raw output
 * is teed to workflow-graph/tee/ so the agent can recover without re-execution.
 * Texts below MIN_COMPRESS_SIZE or above RAW_CAP pass through untouched.
 */
export function compressToolOutput(
  text: string,
  teeDir?: string,
  teeCtx?: string,
): { value: string; saved: number; filter: string | null } {
  const bytesIn = text.length
  if (bytesIn < MIN_COMPRESS_SIZE || bytesIn > RAW_CAP) {
    return { value: text, saved: 0, filter: null }
  }

  const fn = autoDetectFilter(text)
  if (!fn) {
    recordMiss(text)
    return { value: text, saved: 0, filter: null }
  }

  const out = safeApply(fn, text)
  if (!out || out.length === 0 || out.length >= bytesIn) {
    // Compression failed → tee the raw output for recovery
    if (teeDir) {
      const tee = teeRawOutput(text, teeDir, teeCtx ?? 'compress-failed')
      if (tee.pointer) {
        const fallback = `${tee.pointer}\n(compressão falhou — ${bytesIn}B raw output salvo, sem perda de sinal)`
        return { value: fallback, saved: 0, filter: null }
      }
    }
    return { value: text, saved: 0, filter: null }
  }

  const filter = ((fn as unknown as Record<string, unknown>).filterName as string) || fn.name || 'unknown'
  return { value: out, saved: bytesIn - out.length, filter }
}

function compressText(text: string, stats: CompressStats, shape: string): string {
  stats.bytesBefore += text.length
  const r = compressToolOutput(text)
  stats.bytesAfter += r.value.length
  if (r.saved > 0 && r.filter) {
    stats.hits.push({ shape, filter: r.filter, saved: r.saved })
  }
  return r.value
}

/** Format a one-line compression log from `CompressStats`; returns null when stats are empty or no hits occurred. */
export function formatCompressLog(stats: CompressStats | null): string | null {
  if (!stats || !stats.hits || stats.hits.length === 0) return null
  const saved = stats.bytesBefore - stats.bytesAfter
  const pct = stats.bytesBefore > 0 ? ((saved / stats.bytesBefore) * 100).toFixed(1) : '0'
  const filters = Array.from(new Set(stats.hits.map((h) => h.filter))).join(',')
  return `[compress] saved ${saved}B / ${stats.bytesBefore}B (${pct}%) via [${filters}] hits=${stats.hits.length}`
}
