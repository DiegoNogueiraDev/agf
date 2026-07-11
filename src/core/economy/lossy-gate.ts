/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import ts from 'typescript'

export const ContentKind = /** @type {const} */ {
  code: 'code',
  nl: 'nl',
} as const
export type ContentKind = (typeof ContentKind)[keyof typeof ContentKind]

/**
 * Structural interface for a Compress-Cache-Retrieve store. Decoupled on
 * purpose: the caller injects an implementation (e.g. {@link CcrStore} from
 * `ccr-store.ts`, which structurally satisfies this), so `lossy-gate.ts` never
 * hard-imports the concrete store.
 */
export interface CcrLike {
  put(original: string, contentType?: string): string
}

export interface LossyGateConfig<T> {
  original: T
  transform: (input: T) => T | Promise<T>
  kind: ContentKind
  verify?: (original: T, candidate: T) => boolean | Promise<boolean>
  thresholds?: Partial<Record<ContentKind, number>>
  cap?: number
  /**
   * Optional CCR store. When provided AND the value is a string AND the
   * candidate is accepted, the gate caches the ORIGINAL, injects a
   * `⟨ccr:HASH⟩` retrieve marker into the returned value, and reports
   * `ccr_dropped` instead of `accepted` (making the drop reversible).
   */
  ccr?: CcrLike
}

export const GateOutcome = /** @type {const} */ {
  accepted: 'accepted',
  reverted: 'reverted',
  ccr_dropped: 'ccr_dropped',
  passthrough: 'passthrough',
} as const
export type GateOutcome = (typeof GateOutcome)[keyof typeof GateOutcome]

export interface GateResult<T> {
  value: T
  outcome: GateOutcome
  saved: number
}

const DEFAULT_BYTE_THRESHOLDS: Record<string, number> = {
  code: 2048,
  nl: 500,
  json: 1024,
  log: 500,
}

const DEFAULT_CAP = 10 * 1024 * 1024

function getByteSize(value: unknown): number {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value).length
  }
  if (value instanceof Uint8Array) {
    return value.length
  }
  return new TextEncoder().encode(JSON.stringify(value)).length
}

const RE_URL = /https?:\/\/[^\s<>"']+/g
const RE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const RE_CODE_FENCE = /```[\s\S]*?```/g
const RE_DATE = /\b\d{4}-\d{2}-\d{2}\b/g
const RE_TIME = /\b\d{2}:\d{2}(?::\d{2})?\b/g
const RE_NUMBER = /\b\d{3,}\b/g

function parseTopLevelExportNames(source: string): { names: Set<string>; parseOk: boolean } {
  const names = new Set<string>()
  try {
    const sf = ts.createSourceFile('verify.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const parseDiags = (sf as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
    if (parseDiags.length > 0) return { names, parseOk: false }

    const isExported = (node: ts.Node): boolean => {
      const mods = (
        node as
          | ts.FunctionDeclaration
          | ts.ClassDeclaration
          | ts.InterfaceDeclaration
          | ts.TypeAliasDeclaration
          | ts.EnumDeclaration
          | ts.VariableStatement
      ).modifiers
      if (!mods) return false
      return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword)
    }

    ts.forEachChild(sf, (node) => {
      if (ts.isVariableStatement(node) && isExported(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.name && ts.isIdentifier(decl.name)) names.add(decl.name.text)
        }
        return
      }
      const named = node as ts.NamedDeclaration
      if (named.name && ts.isIdentifier(named.name) && isExported(node)) {
        names.add(named.name.text)
      }
    })

    return { names, parseOk: true }
  } catch {
    return { names, parseOk: false }
  }
}

const RE_ERROR_PATTERNS = [
  /Error\b/g,
  /TypeError\b/g,
  /ReferenceError\b/g,
  /RangeError\b/g,
  /SyntaxError\b/g,
  /AssertionError\b/g,
  /\bis_error\b/g,
  /\btry\s*\{/g,
  /\bcatch\s*\(/g,
  /\bthrow\s+new\b/g,
  /\bat\s+\S+\s+\(/g,
  /stack\b.*?Error/g,
  /"error"\s*:/g,
]

export function createErrorPreserveVerify(): (original: string, candidate: string) => boolean {
  return (original: string, candidate: string): boolean => {
    const origPatterns = new Map<string, RegExpExecArray[]>()
    for (const re of RE_ERROR_PATTERNS) {
      const matches: RegExpExecArray[] = []
      const clone = new RegExp(re.source, 'g')
      let m: RegExpExecArray | null
      while ((m = clone.exec(original)) !== null) {
        matches.push(m)
      }
      if (matches.length > 0) origPatterns.set(re.source, matches)
    }

    if (origPatterns.size === 0) return true

    for (const [, matches] of origPatterns) {
      for (const m of matches) {
        if (!candidate.includes(m[0])) return false
      }
    }

    return true
  }
}

export function createCodeVerify(): (original: string, candidate: string) => boolean {
  return (original: string, candidate: string): boolean => {
    const orig = parseTopLevelExportNames(original)
    if (!orig.parseOk) return true
    if (orig.names.size === 0) return true

    const cand = parseTopLevelExportNames(candidate)
    if (!cand.parseOk) return false

    for (const name of orig.names) {
      if (!cand.names.has(name)) return false
    }

    return true
  }
}

export function createNlVerify(): (original: string, candidate: string) => boolean {
  return (original: string, candidate: string): boolean => {
    const urls = original.match(RE_URL) || []
    const emails = original.match(RE_EMAIL) || []
    const fences = original.match(RE_CODE_FENCE) || []
    const dates = original.match(RE_DATE) || []
    const times = original.match(RE_TIME) || []
    const numbers = (original.match(RE_NUMBER) || []).filter((n) => n.length >= 3)

    for (const url of urls) {
      if (!candidate.includes(url)) return false
    }
    for (const email of emails) {
      if (!candidate.includes(email)) return false
    }
    for (const fence of fences) {
      if (!candidate.includes(fence)) return false
    }
    for (const date of dates) {
      if (!candidate.includes(date)) return false
    }
    for (const time of times) {
      if (!candidate.includes(time)) return false
    }
    for (const num of numbers) {
      if (!candidate.includes(num)) return false
    }

    return true
  }
}

export async function applyLossyTransform<T>(config: LossyGateConfig<T>): Promise<GateResult<T>> {
  try {
    const { original, transform, kind, verify, thresholds, cap, ccr } = config

    const sizeBytes = getByteSize(original)

    const effectiveCap = cap ?? DEFAULT_CAP
    if (sizeBytes > effectiveCap) {
      return { value: original, outcome: 'passthrough', saved: 0 }
    }

    const threshold = thresholds?.[kind] ?? DEFAULT_BYTE_THRESHOLDS[kind] ?? DEFAULT_BYTE_THRESHOLDS.nl
    if (sizeBytes < threshold) {
      return { value: original, outcome: 'passthrough', saved: 0 }
    }

    const candidate = await transform(original)

    const originalSize = getByteSize(original)
    const candidateSize = getByteSize(candidate)

    if (candidateSize >= originalSize) {
      return { value: original, outcome: 'reverted', saved: 0 }
    }

    if (verify) {
      const passed = await verify(original, candidate)
      if (!passed) {
        return { value: original, outcome: 'reverted', saved: 0 }
      }
    } else if (kind === 'code') {
      const codePassed = await createCodeVerify()(String(original), String(candidate))
      if (!codePassed) {
        return { value: original, outcome: 'reverted', saved: 0 }
      }
      const errPassed = await createErrorPreserveVerify()(String(original), String(candidate))
      if (!errPassed) {
        return { value: original, outcome: 'reverted', saved: 0 }
      }
    } else if (kind === 'nl') {
      const nlPassed = await createNlVerify()(String(original), String(candidate))
      if (!nlPassed) {
        return { value: original, outcome: 'reverted', saved: 0 }
      }
    }

    // Reversible drop: when a CCR store is injected and the accepted candidate
    // is a string, cache the ORIGINAL and inject a ⟨ccr:HASH⟩ retrieve marker.
    if (ccr && typeof candidate === 'string' && typeof original === 'string') {
      const hash = ccr.put(original)
      const marked = `${candidate}\n⟨ccr:${hash}⟩`
      const markedSize = getByteSize(marked)
      // Only keep the marker if the marked value is still smaller than the
      // original; otherwise fall back to the plain accepted path (no marker).
      if (markedSize < originalSize) {
        return {
          value: marked as unknown as T,
          outcome: 'ccr_dropped',
          saved: originalSize - markedSize,
        }
      }
    }

    return {
      value: candidate,
      outcome: 'accepted',
      saved: originalSize - candidateSize,
    }
  } catch {
    return { value: config.original, outcome: 'reverted', saved: 0 }
  }
}
