/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * convo-miner — ingests ~/.claude/projects/*.jsonl session logs and extracts
 * noteworthy facts (decisions, errors, fixes) into memory nodes with provenance.
 *
 * WHY: conversation logs are a rich source of project decisions and lessons
 * that would otherwise be lost. Mining them surfaces recurring patterns for
 * future recall without requiring manual memory writes.
 *
 * Pure (no I/O): the caller reads the JSONL and passes the raw string.
 * Composing: writeMemory (memory-reader.ts) for persistence; the caller
 * iterates the returned ConvoMinedMemory[] and writes each one.
 *
 * Idempotent: memory name is derived from sessionId + a content hash so
 * re-mining the same session produces the same names (no duplicates).
 */

import { createHash } from 'node:crypto'

/** Signals that a message line contains a extractable fact. */
const SIGNAL_PATTERNS = [/\bDecision:/i, /\bError:/i, /\bFix:/i, /\bLesson:/i, /\bWarning:/i, /\bGotcha:/i]

export interface ConvoMinedMemory {
  /** Memory file name (stable across re-runs of the same session). */
  name: string
  /** Memory body ready for writeMemory(). */
  content: string
  /** Session ID for provenance. */
  sessionId: string
  /** ISO-8601 timestamp of the originating message (if available). */
  timestamp?: string
}

interface JsonlMessage {
  role?: string
  content?: string
  created_at?: string
}

export interface MineOptions {
  sessionId: string
}

/**
 * Parse JSONL session content and extract memory-worthy facts.
 * Returns an array of ConvoMinedMemory, one per extracted fact.
 * Idempotent: same input → same output names.
 */
export function mineConversation(jsonl: string, opts: MineOptions): ConvoMinedMemory[] {
  const results: ConvoMinedMemory[] = []

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let msg: JsonlMessage
    try {
      msg = JSON.parse(trimmed) as JsonlMessage
    } catch {
      continue
    }

    if (msg.role !== 'assistant') continue
    const content = msg.content
    if (!content || typeof content !== 'string') continue

    // Extract sentences that match signal patterns
    const sentences = content.split(/(?<=[.!?])\s+/).filter((s) => SIGNAL_PATTERNS.some((p) => p.test(s)))

    for (const sentence of sentences) {
      const hash = createHash('sha1').update(`${opts.sessionId}:${sentence}`).digest('hex').slice(0, 8)
      const name = `convo-${opts.sessionId.slice(-12)}-${hash}`
      results.push({
        name,
        content: `${sentence}\n\n[Source: session=${opts.sessionId}, ts=${msg.created_at ?? 'unknown'}]`,
        sessionId: opts.sessionId,
        timestamp: msg.created_at,
      })
    }
  }

  return results
}
