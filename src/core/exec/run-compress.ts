/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Core wrapper: compress raw tool output or run a child process and compress
 * its stdout. Pure core — no child_process import; the runner is injected via
 * RunnerPort (DIP), keeping this module testable without spawning processes.
 *
 * WHY here: single owning module for compress-and-measure so CLI commands and
 * PostToolUse hooks share the same entry point without duplicating token math.
 * Composing: compressToolOutput (tool-compress/index.ts), routeContent
 * (content-router.ts), applyCcrToRouted (economy-orchestrator.ts),
 * estimateTokens (token-estimator.ts), CcrStore/CcrLike (ccr-store.ts).
 */

import type { CcrLike } from '../economy/lossy-gate.js'
import { compressToolOutput } from '../tool-compress/index.js'
import { routeContent } from '../economy/content-router.js'
import { applyCcrToRouted } from '../economy/economy-orchestrator.js'
import { estimateTokens } from '../context/token-estimator.js'

/** Result of a compress operation. */
export interface CompressResult {
  compressed: string
  tokensBefore: number
  tokensAfter: number
  saved: number
  ratio: number
  filter: string | null
  lossless: boolean
  ccrHash?: string
}

/** Port for injecting a process runner (DIP). */
export interface RunnerPort {
  (argv: string[]): Promise<{ stdout: string; exitCode: number }>
}

/** Result of runAndCompress — adds exitCode to CompressResult. */
export interface RunCompressResult extends CompressResult {
  exitCode: number
}

/**
 * Compress raw text via the tool-compress pipeline + CCR marker when provided.
 * Combines tool-compress (lossless) path with the content router (lossy-capable).
 *
 * @param raw - Raw tool output string.
 * @param ccr - Active CCR store for reversible lossy compression, or null.
 */
export function compressOutput(raw: string, ccr: CcrLike | null): CompressResult {
  const tokensBefore = estimateTokens(raw)

  // L1: tool-compress lossless (auto-detect filter)
  const rtkResult = compressToolOutput(raw)
  const rtkOutput = rtkResult.value

  // L2: content-router (may be lossy)
  const routed = routeContent(rtkOutput)

  // L3: optional CCR wrap for lossy paths
  const applied = applyCcrToRouted(raw, routed.output, routed.saved, ccr)

  const tokensAfter = estimateTokens(applied.content)
  const saved = tokensBefore - tokensAfter
  const ratio = tokensBefore > 0 ? tokensAfter / tokensBefore : 1

  // Detect if any CCR hash was embedded
  const ccrMatch = applied.content.match(/⟨ccr:([0-9a-f]{64})⟩/)
  const ccrHash = ccrMatch ? ccrMatch[1] : undefined

  return {
    compressed: applied.content,
    tokensBefore,
    tokensAfter,
    saved,
    ratio,
    filter: rtkResult.filter,
    lossless: !routed.lossy,
    ccrHash,
  }
}

/**
 * Run an external command via the injected runner, then compress its stdout.
 *
 * @param argv - Command + arguments array (no shell expansion).
 * @param deps - Injected dependencies: runner port + optional CCR store.
 */
export async function runAndCompress(
  argv: string[],
  deps: { runner: RunnerPort; ccr: CcrLike | null },
): Promise<RunCompressResult> {
  const { stdout, exitCode } = await deps.runner(argv)
  const compressResult = compressOutput(stdout, deps.ccr)
  return { ...compressResult, exitCode }
}
