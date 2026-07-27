/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-provider-sdk-lockdown — Provider SDK Lockdown Detector
 *
 * Pure detector — no fs, no network, no side-effects.
 * Mirrors anti-hallucination-detector.ts structure.
 *
 * Rule reference: .claude/rules/deterministic-first.md
 */

export const FORBIDDEN_SDKS = [
  'openai',
  '@anthropic-ai/sdk',
  '@google/genai',
  '@google/generative-ai',
  'cohere-ai',
  'groq-sdk',
  '@mistralai/mistralai',
  'together-ai',
] as const

export type ForbiddenSdk = (typeof FORBIDDEN_SDKS)[number]

const FORBIDDEN_SET: ReadonlySet<string> = new Set(FORBIDDEN_SDKS)

export interface Violation {
  path: string
  line: number
  sdk: string
  pattern: string
}

const ALLOWLIST_RE = /^src\/core\/llm\/adapters\/.+\.ts$/

/** Strip block comments while preserving newlines for correct line numbers. */
function stripBlockComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

/** Strip line comment from a single line, respecting string literals. */
function stripLineComment(line: string): string {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    const ch = line[i]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    const next = line[i + 1]!
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === '/' && next === '/' && !inSingle && !inDouble) {
      return line.slice(0, i)
    }
  }
  return line
}

// Matches: import ... from "SDK" or export ... from "SDK" anchored at line start
const IMPORT_EXPORT_FROM_RE = /^\s*(?:import|export)\b/
const FROM_CLAUSE_RE = /\bfrom\s+["']([^"']+)["']/

// Matches: require("SDK")
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/

// Matches: import("SDK") — dynamic import (import followed by `(`)
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/

function checkSdk(sdk: string): boolean {
  return FORBIDDEN_SET.has(sdk)
}

/**
 * detectViolations — pure function that scans files for forbidden provider SDK
 * imports outside the allowed adapters directory.
 *
 * @param files - Array of { path, content } — caller reads from disk
 * @returns Array of Violation objects, one per matched import line
 */
export function detectViolations(files: { path: string; content: string }[]): Violation[] {
  const violations: Violation[] = []

  for (const { path, content } of files) {
    if (ALLOWLIST_RE.test(path)) continue

    const cleaned = stripBlockComments(content)
    const lines = cleaned.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i] ?? ''
      const line = stripLineComment(rawLine)
      const lineNum = i + 1

      // import/export ... from "SDK" (anchored: import/export must start line)
      if (IMPORT_EXPORT_FROM_RE.test(line)) {
        const m = FROM_CLAUSE_RE.exec(line)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
        if (m && checkSdk(m[1]!)) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
          violations.push({ path, line: lineNum, sdk: m[1]!, pattern: 'import/export from' })
          continue
        }
      }

      // require("SDK")
      const req = REQUIRE_RE.exec(line)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
      if (req && checkSdk(req[1]!)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
        violations.push({ path, line: lineNum, sdk: req[1]!, pattern: 'require' })
        continue
      }

      // import("SDK") — dynamic import
      const dyn = DYNAMIC_IMPORT_RE.exec(line)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
      if (dyn && checkSdk(dyn[1]!)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
        violations.push({ path, line: lineNum, sdk: dyn[1]!, pattern: 'dynamic import' })
      }
    }
  }

  return violations
}
