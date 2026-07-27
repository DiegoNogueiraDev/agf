/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TypeScript canonicalization for stable content hashing (ADR-0048).
 *
 * Strategy:
 * 1. Try ts-morph / typescript compiler API to parse + print canonical form.
 * 2. If TS parse fails or dep missing, fall back to whitespace/comment-strip.
 *
 * Goal: variations triviais (whitespace, trailing commas, comment styles)
 * produce identical hashes; semantic differences produce different hashes.
 */

import { createHash } from 'node:crypto'

/** Strip line and block comments. */
function stripComments(input: string): string {
  // Remove block comments (non-greedy, multiline)
  let out = input.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove line comments (to end of line)
  out = out.replace(/^[ \t]*\/\/.*$/gm, '')
  out = out.replace(/[ \t]+\/\/.*$/gm, '')
  return out
}

/** Collapse whitespace: remove blank lines, trim each line, normalize EOL. */
function normalizeWhitespace(input: string): string {
  return input
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+$/g, '')) // trim trailing whitespace
    .filter((l) => l.trim().length > 0)
    .join('\n')
    .trim()
}

/**
 * Canonicalize TypeScript/JavaScript content so trivial variations hash the same.
 *
 * For v11 Task 1.1, we use a lightweight comment+whitespace strip. The PRD
 * contemplates ts-morph for AST-level canonicalization; we keep that door open
 * via a dynamic import in a future iteration, but the fallback path (used now)
 * is sufficient for the AC "Hash estavel entre re-runs ... normaliza whitespace
 * e comentarios triviais".
 */
export function canonicalizeTypeScript(input: string): string {
  try {
    const noComments = stripComments(input)
    return normalizeWhitespace(noComments)
  } catch {
    // Ultimate fallback — input probably pathological; return trimmed raw
    return input.trim()
  }
}

/**
 * Compute stable content hash over canonicalized content.
 * sha256 hex string (64 chars).
 */
export function computeContentHash(content: string): string {
  const canonical = canonicalizeTypeScript(content)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
