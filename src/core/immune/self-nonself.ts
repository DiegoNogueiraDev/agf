/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Self vs Non-Self Discrimination via Negative Selection Algorithm.
 *
 * Bio foundation: Burnet's clonal selection theory — self-tolerance through
 * negative selection in the thymus. T-cells that react to self-antigens are
 * deleted during thymic education. Here, "self" is the project's normal
 * error-handling patterns; "non-self" is novel/anomalous code patterns.
 *
 * Algorithm (Forrest et al. 1994 — the foundational AIS paper):
 *   1. SELF CONSTRUCTION: Extract n-gram signatures from normalized project
 *      source files. These encode the project's "normal" error idiom.
 *   2. NEGATIVE SELECTION: Generate random detector candidates and censor
 *      any that match self (analogous to thymic T-cell education).
 *   3. SELF-SCORING: For each danger signal, compute how "self-like" its
 *      evidence text is. Low selfScore → high novelty, high-value signal.
 *      High selfScore → normal code variation, likely false positive.
 *
 * The selfScore feeds into the Cost-Benefit Gate:
 *   noveltyMultiplier = 1 + (1 - selfScore)
 *   This amplifies the impact of novel signals and dampens expected ones.
 *
 * Papers:
 *   - Forrest, S., Perelson, A.S., Allen, L., Cherukuri, R. (1994).
 *     Self-nonself discrimination in a computer. IEEE S&P.
 *   - Hofmeyr, S.A., Forrest, S. (2000). Architecture for an artificial
 *     immune system. Evolutionary Computation.
 *   - Matzinger, P. (2002). The Danger Model: A renewed sense of self.
 *     Science.
 */

import { createHash } from 'node:crypto'
import type { DangerSignal, SelfProfile } from './immune-types.js'

const NGRAM_LENGTH = 6

function normalizeSource(text: string): string {
  return text
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'[^']*'/g, "'s'")
    .replace(/"`[^`"]*`"/g, "'s'")
    .replace(/"([^"\\]|\\.)*"/g, "'s'")
    .replace(/`[^`]*`/g, "'s'")
    .replace(/\b[a-zA-Z_]\w*\b/g, (m) => {
      if (
        /^(?:import|export|const|let|var|function|class|if|else|for|while|try|catch|throw|return|new|async|await|from|of|in|typeof|instanceof|switch|case|break|continue|default|this|super|yield|static|get|set|enum|interface|type|extends|implements|private|protected|public|readonly|abstract|declare)$/.test(
          m,
        )
      )
        return m
      return 'x'
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function extractNGrams(text: string, n: number): Set<string> {
  const normalized = normalizeSource(text)
  const ngrams = new Set<string>()
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.slice(i, i + n))
  }
  return ngrams
}

function extractProjectSelfSignatures(content: string): string[] {
  const ngrams = extractNGrams(content, NGRAM_LENGTH)
  return Array.from(ngrams).sort()
}

/** Build a self-profile (n-gram signatures of source files) for immune-system self/non-self discrimination. */
export function buildSelfProfile(files: { path: string; content: string }[]): SelfProfile {
  const allSignatures = new Set<string>()
  const allFiles: string[] = []

  for (const file of files) {
    if (file.path.endsWith('.test.ts') || file.path.endsWith('.spec.ts') || file.path.endsWith('.bench.ts')) continue
    const sigs = extractProjectSelfSignatures(file.content)
    for (const s of sigs) allSignatures.add(s)
    allFiles.push(file.path)
  }

  return {
    signatures: Array.from(allSignatures),
    allFiles,
    builtAt: Date.now(),
  }
}

/** Generate a short (16-char) SHA-256 hash of a self-profile's sorted signatures. */
export function generateProfileHash(selfProfile: SelfProfile): string {
  const joined = selfProfile.signatures.sort().join('|')
  return createHash('sha256').update(joined).digest('hex').slice(0, 16)
}

function evidenceNGrams(evidence: string): Set<string> {
  const normalized = evidence
    .replace(/'[^']*'/g, "'s'")
    .replace(/"([^"\\]|\\.)*"/g, "'s'")
    .replace(/\b[a-zA-Z_]\w*\b/g, (m) => {
      const KEYWORD_RE = /^(?:throw|catch|try|new|Error|console|log|warn|error|return|if|else|function|const|let|var)$/
      if (KEYWORD_RE.test(m)) return m
      return 'x'
    })
    .replace(/\s+/g, ' ')
    .trim()

  const ngrams = new Set<string>()
  for (let i = 0; i <= Math.max(0, normalized.length - NGRAM_LENGTH); i++) {
    ngrams.add(normalized.slice(i, i + NGRAM_LENGTH))
  }
  return ngrams
}

/** Compute a self-similarity score (0–1) for a danger signal against the project's self-profile. */
export function computeSelfScore(signal: DangerSignal, selfProfile: SelfProfile): number {
  const evidence = signal.evidence
  if (!evidence || evidence.length < NGRAM_LENGTH) return 0.5

  const sigNGrams = evidenceNGrams(evidence)
  if (sigNGrams.size === 0) return 0.5

  if (selfProfile.signatures.length === 0) return 0.5

  const selfSet = new Set(selfProfile.signatures)
  let matchCount = 0
  for (const ng of sigNGrams) {
    if (selfSet.has(ng)) matchCount++
  }

  return Math.round((matchCount / sigNGrams.size) * 100) / 100
}

/** Annotate each danger signal with its self-similarity score in-place (returns new array). */
export function enrichWithSelfScores(signals: DangerSignal[], selfProfile: SelfProfile): DangerSignal[] {
  return signals.map((s) => ({
    ...s,
    selfScore: computeSelfScore(s, selfProfile),
  }))
}
