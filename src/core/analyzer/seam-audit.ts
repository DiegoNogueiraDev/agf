/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-9.T05 — Seam audit.
 * Pure: classify each import specifier into one of 4 seam categories so the
 * analyze tool can suggest substitutes/mocks. Caller (analyze tool) reads
 * file content + passes it here.
 */

export type SeamCategory = 'in-process' | 'local-substitutable' | 'remote-owned' | 'true-external'

const LOCAL_SUBSTITUTABLE = new Set([
  'better-sqlite3',
  'fs',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:os',
  'node:child_process',
  'fs/promises',
  'path',
  'os',
  'node:crypto',
  'crypto',
])

const TRUE_EXTERNAL_PREFIXES = [
  '@anthropic-ai/',
  '@openai/',
  'openai',
  'anthropic',
  '@aws-sdk/',
  'stripe',
  '@google-cloud/',
  '@vercel/',
]

const REMOTE_OWNED_HINTS = ['@modelcontextprotocol/', '@grpc/', 'axios', 'node-fetch', 'undici']

export interface ClassifiedImport {
  specifier: string
  category: SeamCategory
  suggestion: string
}

export interface SeamReport {
  file: string
  imports: ClassifiedImport[]
  summary: Record<SeamCategory, number>
}

const IMPORT_RE = /^\s*(?:import|export)\s+[^'"]*\s+from\s+["']([^"']+)["']/gm

/** extractImportSpecifiers —  */
export function extractImportSpecifiers(content: string): string[] {
  const out: string[] = []
  let match: RegExpExecArray | null
  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(content)) !== null) {
    out.push(match[1])
  }
  return out
}

/** classifySpecifier —  */
export function classifySpecifier(spec: string): ClassifiedImport {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return {
      specifier: spec,
      category: 'in-process',
      suggestion: 'in-process: consider merging if only one consumer',
    }
  }
  if (LOCAL_SUBSTITUTABLE.has(spec)) {
    return {
      specifier: spec,
      category: 'local-substitutable',
      suggestion: 'local-substitutable: inject through interface; use stand-in in tests',
    }
  }
  for (const prefix of TRUE_EXTERNAL_PREFIXES) {
    if (spec === prefix || spec.startsWith(prefix)) {
      return {
        specifier: spec,
        category: 'true-external',
        suggestion: 'true-external: wrap behind adapter; mock in tests; never depend in core',
      }
    }
  }
  for (const hint of REMOTE_OWNED_HINTS) {
    if (spec === hint || spec.startsWith(hint)) {
      return {
        specifier: spec,
        category: 'remote-owned',
        suggestion: 'remote-owned: keep at boundary; add timeout + retry policy',
      }
    }
  }
  // Unknown third-party → treat as remote-owned by default.
  return {
    specifier: spec,
    category: 'remote-owned',
    suggestion: 'remote-owned (heuristic): inspect manually; isolate via wrapper',
  }
}

/** auditFile —  */
export function auditFile(file: string, content: string): SeamReport {
  const imports = extractImportSpecifiers(content).map(classifySpecifier)
  const summary: Record<SeamCategory, number> = {
    'in-process': 0,
    'local-substitutable': 0,
    'remote-owned': 0,
    'true-external': 0,
  }
  for (const i of imports) summary[i.category]++
  return { file, imports, summary }
}
