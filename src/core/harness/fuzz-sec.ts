/*!
 * fuzz-sec — adversarial security input generator for boundary functions.
 *
 * WHY: unit tests verify expected inputs; fuzz-sec tests the unexpected —
 * shell metacharacters, malformed JSON, ReDoS payloads, and null-byte tricks.
 * An unhandled throw from a boundary function is a security finding.
 *
 * No external deps (no fast-check). Reuses the adversarial-corpus approach
 * from synthetic-data-gen.ts (same layer). Pure, deterministic, 0-token.
 *
 * Composes with: harness-scan-runner (peer), synthetic-data-gen (sibling).
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface FuzzFinding {
  /** The input value that caused the crash. */
  input: unknown
  /** The error message or class thrown. */
  error: string
}

export interface FuzzOptions {
  /** Maximum number of adversarial inputs to try. Default: 100. */
  maxInputs?: number
}

export interface FuzzScanFinding extends FuzzFinding {
  /** Name of the exported function that crashed. */
  fn: string
}

export interface FuzzScanResult {
  /** Module path as passed in (relative to rootDir). */
  module: string
  /** Names of exported functions fuzzed (single-arg exports only). */
  functionsScanned: string[]
  findings: FuzzScanFinding[]
}

// ---------------------------------------------------------------------------
// Adversarial corpus — security-focused payloads
// ---------------------------------------------------------------------------

const ADVERSARIAL_STRINGS: string[] = [
  // Shell injection
  '`id`',
  '$(id)',
  '; rm -rf /',
  '&& cat /etc/passwd',
  '| ls -la',
  '\0',
  '\x00null\x00byte',
  // ReDoS patterns
  'a'.repeat(100),
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaab',
  '(a+)+b',
  // Malformed JSON
  '{unclosed',
  '{"key": undefined}',
  '[\x00,\x01]',
  // Path traversal
  '../../etc/passwd',
  '../'.repeat(20) + 'etc/passwd',
  // XSS
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  // Prototype pollution
  '__proto__[admin]=true',
  '{"__proto__":{"isAdmin":true}}',
  // Unicode edge cases
  '�',
  '\uD800',
  '\uDFFF',
  // Oversized
  'A'.repeat(10_000),
  // Empty / whitespace
  '',
  '   ',
  '\n\t\r',
  // Numbers as strings
  'NaN',
  'Infinity',
  '-Infinity',
  '9'.repeat(400),
  // SQL-ish
  "' OR '1'='1",
  '1; DROP TABLE users--',
  // Null / undefined as strings
  'null',
  'undefined',
]

/**
 * Run `fn` against the built-in adversarial corpus.
 * Any unhandled exception becomes a `FuzzFinding`.
 * Returns all findings (may be empty for robust functions).
 */
export function fuzzBoundary(fn: (input: string) => unknown, opts: FuzzOptions = {}): FuzzFinding[] {
  const maxInputs = opts.maxInputs ?? 100
  const corpus = ADVERSARIAL_STRINGS.slice(0, maxInputs)
  const findings: FuzzFinding[] = []

  for (const input of corpus) {
    try {
      fn(input)
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      findings.push({ input, error })
    }
  }

  return findings
}

/**
 * Load `modulePath` (relative to rootDir) and fuzz every exported function that
 * takes exactly one argument (the boundary-function shape `fuzzBoundary` expects).
 * This is the CLI-facing entry point (`agf harness --fuzz <module>`).
 */
export async function runFuzzScan(
  rootDir: string,
  modulePath: string,
  opts: FuzzOptions = {},
): Promise<FuzzScanResult> {
  const abs = resolve(rootDir, modulePath)
  const mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>

  const functionsScanned: string[] = []
  const findings: FuzzScanFinding[] = []
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === 'function' && value.length === 1) {
      functionsScanned.push(name)
      const fn = value as (input: string) => unknown
      for (const finding of fuzzBoundary(fn, opts)) {
        findings.push({ fn: name, ...finding })
      }
    }
  }

  return { module: modulePath, functionsScanned, findings }
}
