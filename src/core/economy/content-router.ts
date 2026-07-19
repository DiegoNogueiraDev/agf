/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ContentRouter — dispatches tool output to the correct compressor by content type.
 *
 * Routes:
 *   code → tool-compress (lossless, deterministic, 0-token output compression)
 *   json → JSON summarizer (key structure + type hints, preserves schema)
 *   log  → dedupLog (collapses repeated lines, preserves unique entries)
 *   text → caveman (strips filler/hedging/articles, preserves meaning)
 */

import { detectContentType, type ContentType } from './content-dispatch.js'
import { compressToolOutput } from '../tool-compress/index.js'
import { dedupLog } from '../tool-compress/filters/dedupLog.js'
import { cavemanFilterInput } from './caveman-input.js'
import { astCompressCode } from './code-ast-compress.js'
import { selectByMDL } from './mdl-selector.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'content-router.ts' })

export interface RouteResult {
  output: string
  bytesBefore: number
  bytesAfter: number
  saved: number
  contentType: ContentType
  compressor: string
  /** `'mdl'` when the MDL selector adjudicated the keep/drop decision (opt-in). */
  selector?: 'mdl'
  /**
   * AUDIT-045: true when the adopted compression is non-reversible on its own
   * (e.g. a JSON N-array truncated to an exemplar, or an AST body-drop). The
   * orchestrator must CCR-wrap a `lossy` output to keep it recoverable.
   */
  lossy: boolean
}

export interface RouteOptions {
  /**
   * Opt-in MDL gate (`mdl_select` lever). When true, a compression is only kept
   * if its description length — residual bytes **plus** a CCR retrieval round-trip
   * penalty — is smaller than the original (identity candidate). Marginal
   * compressions that don't beat the retrieval cost are rejected. Default off →
   * any byte shrink is adopted (legacy behaviour).
   */
  mdl?: boolean
  /**
   * AUDIT-045: opt-in verify gate. When true, a `lossy` (non-reversible)
   * compression is NOT adopted — routeContent falls back to the original
   * (identity). Use when the caller cannot CCR-wrap the output. Default off →
   * lossy compressions are adopted (legacy behaviour), just flagged `lossy`.
   */
  verify?: boolean
}

/** Compressors whose output cannot be reconstructed without the cached original. */
const LOSSY_COMPRESSORS = new Set(['json-summarizer', 'ast_compress', 'caveman'])

/**
 * Description-length penalty for reversing a lossy drop via a `⟨ccr:hash⟩`
 * round-trip (Rissanen MDL: the model/codebook cost must be paid back). A
 * compression saving fewer bytes than this is not worth keeping.
 */
export const MDL_RETRIEVAL_PENALTY_BYTES = 24

const JSON_MIN_COMPRESS = 256

// Abaixo deste tamanho, código fica no caminho lossless (tool-compress) — sem AST.
const CODE_AST_MIN = 512

// Share of elements that must match the reference key set for an array to count
// as homogeneous and qualify for SmartCrusher-style crushing.
const HOMOGENEITY_THRESHOLD = 0.9

function typeOf(val: unknown): string {
  if (val === null) return 'null'
  if (Array.isArray(val)) return 'array'
  return typeof val
}

/**
 * SmartCrusher-style crush for a HOMOGENEOUS array of objects: drop N→1 payload by
 * emitting a single exemplar + a per-field type schema. Returns null when the array
 * is not homogeneous (caller then falls back to the `_first_` summary).
 *
 * Reversibility is NOT handled here — the orchestrator (task A4) caches the
 * pre-routing original and wraps routeContent output in a ⟨ccr:hash⟩ marker.
 */
function crushHomogeneousArray(arr: readonly unknown[]): string | null {
  if (arr.length === 0) return null

  const first = arr[0]
  if (first === null || typeof first !== 'object' || Array.isArray(first)) return null

  const refKeys = Object.keys(first as Record<string, unknown>)
  if (refKeys.length === 0) return null
  const refSet = new Set(refKeys)

  let matching = 0
  const fieldTypes = new Map<string, Set<string>>()
  for (const key of refKeys) fieldTypes.set(key, new Set<string>())

  for (const el of arr) {
    if (el === null || typeof el !== 'object' || Array.isArray(el)) continue
    const obj = el as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === refSet.size && keys.every((k) => refSet.has(k))) {
      matching++
      for (const key of refKeys) fieldTypes.get(key)?.add(typeOf(obj[key]))
    }
  }

  if (matching / arr.length < HOMOGENEITY_THRESHOLD) return null

  const fields: Record<string, string> = {}
  for (const key of refKeys) {
    fields[key] = Array.from(fieldTypes.get(key) ?? [])
      .sort()
      .join('|')
  }

  return JSON.stringify({
    _type_: `array[${arr.length}]`,
    _exemplar_: first,
    _fields_: fields,
  })
}

function compressJson(text: string): { output: string; compressor: string } {
  if (text.length < JSON_MIN_COMPRESS) {
    return { output: text, compressor: 'json-summarizer' }
  }

  try {
    const parsed = JSON.parse(text) as unknown

    if (Array.isArray(parsed)) {
      const crushed = crushHomogeneousArray(parsed)
      if (crushed !== null && crushed.length < text.length) {
        return { output: crushed, compressor: 'json-summarizer' }
      }
      const first = parsed.slice(0, 3)
      const summary = JSON.stringify({
        _type_: `array[${parsed.length}]`,
        _first_: first,
      })
      if (summary.length < text.length) {
        return { output: summary, compressor: 'json-summarizer' }
      }
    } else if (parsed && typeof parsed === 'object') {
      const keys = Object.keys(parsed)
      if (keys.length === 0) {
        return { output: text, compressor: 'json-summarizer' }
      }
      const schema: Record<string, string> = {}
      for (const key of keys) {
        const val = (parsed as Record<string, unknown>)[key]
        if (Array.isArray(val)) {
          schema[key] = `array[${val.length}]`
        } else if (val !== null && typeof val === 'object') {
          schema[key] = `{${Object.keys(val as Record<string, unknown>).length} keys}`
        } else {
          schema[key] = typeof val
        }
      }
      const summary = JSON.stringify({ _type_: `object[${keys.length} keys]`, _schema_: schema })
      if (summary.length < text.length) {
        return { output: summary, compressor: 'json-summarizer' }
      }
    }
  } catch {
    // Invalid JSON somehow passed detection — passthrough
  }

  return { output: text, compressor: 'json-summarizer' }
}

/** Routes content through the SmartCrusher pipeline or JSON/AST compressors based on detected content type. */
export function routeContent(text: string, opts: RouteOptions = {}): RouteResult {
  const bytesBefore = text.length
  const contentType = detectContentType(text)

  let output: string
  let compressor: string

  switch (contentType) {
    case 'code': {
      const rtkResult = compressToolOutput(text)
      output = rtkResult.value
      compressor = rtkResult.filter ?? 'code-passthrough'
      // Lossy-gate (T4.2): em código grande, tenta a compressão AST (drop de
      // corpos de função). astCompressCode auto-reverte (retorna o input) se o
      // parse falha ou não encolhe — então só adotamos quando há ganho real.
      if (text.length >= CODE_AST_MIN) {
        const ast = astCompressCode(text)
        if (ast.length < output.length) {
          output = ast
          compressor = 'ast_compress'
        }
      }
      break
    }
    case 'json': {
      const jsonResult = compressJson(text)
      output = jsonResult.output
      compressor = jsonResult.compressor
      break
    }
    case 'log': {
      output = dedupLog(text)
      compressor = 'dedup-log'
      break
    }
    case 'text': {
      output = cavemanFilterInput(text)
      compressor = 'caveman'
      break
    }
    default:
      output = text
      compressor = 'identity'
  }

  // MDL gate (opt-in): keep the compression only if its description length
  // (residual + CCR retrieval penalty) beats the original. Rejects marginal
  // drops not worth a reversal round-trip.
  let selector: 'mdl' | undefined
  if (opts.mdl && output.length < bytesBefore) {
    const { chosen } = selectByMDL([
      {
        id: compressor,
        residualBytes: output.length,
        modelBytes: 0,
        retrievalPenaltyBytes: MDL_RETRIEVAL_PENALTY_BYTES,
      },
      { id: 'identity', residualBytes: bytesBefore, modelBytes: 0 },
    ])
    selector = 'mdl'
    if (chosen?.id === 'identity') {
      output = text
      compressor = 'identity'
    }
  }

  // AUDIT-045: flag lossy adoption and, under verify, refuse to keep a
  // non-reversible drop (fall back to the original / identity).
  let lossy = output !== text && LOSSY_COMPRESSORS.has(compressor)
  if (opts.verify && lossy) {
    output = text
    compressor = 'identity'
    lossy = false
  }

  const result: RouteResult = {
    output,
    bytesBefore,
    bytesAfter: output.length,
    saved: bytesBefore - output.length,
    contentType,
    compressor,
    lossy,
    ...(selector ? { selector } : {}),
  }

  log.debug('content-router:routed', {
    contentType,
    compressor,
    bytesBefore,
    bytesAfter: output.length,
    saved: bytesBefore - output.length,
  })

  return result
}

/** Returns the input unchanged as a bypass RouteResult (used when compression is disabled or fails). */
export function routeContentBypass(text: string): RouteResult {
  const bytesBefore = text.length
  return {
    output: text,
    bytesBefore,
    bytesAfter: bytesBefore,
    saved: 0,
    contentType: 'text',
    compressor: 'bypass',
    lossy: false,
  }
}
