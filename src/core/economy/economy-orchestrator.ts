/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import type Database from 'better-sqlite3'
import { compressMessages } from '../tool-compress/index.js'
import { resolveLeverPlan } from '../economy/harness-lever-policy.js'
import { applyLossyTransform } from '../economy/lossy-gate.js'
import { cavemanFilterInput } from '../economy/caveman-input.js'
import { getCavemanMode, type CavemanMode } from '../llm/caveman-filter.js'
import { routeContent } from '../economy/content-router.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import type { LeverEvent } from '../economy/economy-lever-ledger.js'
import {
  economyLeversSourceFromDb,
  resolveEconomyLeversConfig,
  isLeverEnabled,
} from '../economy/economy-levers-config.js'
import { SeenSketch } from '../economy/seen-sketch.js'
import { contextDiff, type ContextChunk } from '../context/context-diff.js'
import { informationBottleneckScore } from '../economy/info-bottleneck.js'
import { CcrStore, ccrMarker } from '../economy/ccr-store.js'
import type { CcrLike } from '../economy/lossy-gate.js'
import { emitEconomyHook } from '../hooks/economy-lifecycle-hooks.js'

/** Marker that replaces a tool message already sent verbatim earlier this session. */
const CONTEXT_DIFF_MARKER = '⟨context-diff: already sent earlier this session⟩'

/**
 * Deterministic predictive-info proxy ∈ [0,1] for the IB gate: the fraction of
 * the original's distinct word tokens that survive in the candidate (token-set
 * recall). 1 ⇒ all content words preserved; lower ⇒ meaning likely lost.
 */
function tokenRecall(original: string, candidate: string): number {
  const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const orig = words(original)
  if (orig.size === 0) return 1
  const cand = words(candidate)
  let kept = 0
  for (const w of orig) if (cand.has(w)) kept++
  return kept / orig.size
}

export interface EconomyMiddlewareOptions {
  rootDir?: string
  db?: Database.Database
}

export interface CcrRoutedResult {
  content: string
  saved: number
  outcome: 'accepted' | 'ccr_dropped'
}

/**
 * Pure decision for the content-router CCR lever. Given a routed (compressed)
 * tool-message output that already shrank the original, decide whether to make
 * the drop reversible via CCR.
 *
 * - `ccr === null` → behavior UNCHANGED: returns the plain `accepted` path
 *   (no marker, `saved = routedSaved`), byte-identical to the pre-A4 path.
 * - `ccr` active → cache the original, append a `⟨ccr:HASH⟩` marker, recompute
 *   `saved` after the marker, and report `ccr_dropped`. If the marker makes the
 *   content not smaller than the original, fall back to the plain `accepted`
 *   path (no marker).
 *
 * Extracted as a pure helper so it can be unit-tested without coupling to the
 * harness policy that derives `plan.ccr`.
 *
 * @param originalContent The pre-routing tool-message content.
 * @param routedOutput The routed (compressed) output (already `< originalContent`).
 * @param routedSaved Bytes saved by routing alone (`originalContent.length - routedOutput.length`).
 * @param ccr An active CCR store, or `null` to keep the legacy accepted path.
 */
export function applyCcrToRouted(
  originalContent: string,
  routedOutput: string,
  routedSaved: number,
  ccr: CcrLike | null,
): CcrRoutedResult {
  if (!ccr) {
    return { content: routedOutput, saved: routedSaved, outcome: 'accepted' }
  }

  const textBefore = originalContent.length
  const hash = ccr.put(originalContent)
  const marked = `${routedOutput}\n${ccrMarker(hash)}`

  if (marked.length < textBefore) {
    return { content: marked, saved: textBefore - marked.length, outcome: 'ccr_dropped' }
  }

  // Marker erases the gain — fall back to the plain accepted path (no marker).
  return { content: routedOutput, saved: routedSaved, outcome: 'accepted' }
}

export function createEconomyMiddleware(opts: EconomyMiddlewareOptions) {
  const compressEnabled = process.env.ECONOMY_COMPRESS !== 'off'
  const cavemanEnabled = process.env.ECONOMY_CAVEMAN_INPUT !== 'off'
  const crEnabled = process.env.ECONOMY_CONTENT_ROUTER !== 'off'
  // Session-scoped prior: persists across calls to this middleware instance so a
  // tool output already sent earlier this session can be diffed away (opt-in).
  const sessionSeen = new SeenSketch()

  return async function economyMiddleware<T extends Record<string, unknown>>(
    body: T,
    next: (body: T) => Promise<T>,
  ): Promise<T> {
    const diffEnabled = opts.db
      ? isLeverEnabled(resolveEconomyLeversConfig(economyLeversSourceFromDb(opts.db)), 'context_diff')
      : false
    if (!compressEnabled && !cavemanEnabled && !crEnabled && !diffEnabled) return next(body)

    const plan = resolveLeverPlan(opts.rootDir)
    const events: Array<{
      lever: string
      tokensBefore: number
      tokensAfter: number
      saved: number
      accepted: boolean
      gateOutcome: LeverEvent['gateOutcome']
      score?: number
    }> = []

    if (compressEnabled) {
      const bodyBefore = JSON.stringify(body).length
      emitEconomyHook('pre_compress', { lever: 'compress', bytesBefore: bodyBefore })
      compressMessages(body as unknown as Record<string, unknown>, true)
      const bodyAfter = JSON.stringify(body).length
      if (bodyAfter < bodyBefore) {
        const saved = bodyBefore - bodyAfter
        emitEconomyHook('post_compress', {
          lever: 'compress',
          bytesBefore: bodyBefore,
          bytesAfter: bodyAfter,
          saved,
          savedPct: bodyBefore > 0 ? Math.round((saved / bodyBefore) * 100) : 0,
        })
        events.push({
          lever: 'compress',
          tokensBefore: bodyBefore,
          tokensAfter: bodyAfter,
          saved,
          accepted: true,
          gateOutcome: 'accepted',
        })
      }
    }

    if (crEnabled) {
      const ccr: CcrLike | null = plan.ccr && opts.db ? new CcrStore(opts.db) : null
      // MDL gate (opt-in `mdl_select` lever): reject marginal compressions.
      const mdlOn = opts.db
        ? isLeverEnabled(resolveEconomyLeversConfig(economyLeversSourceFromDb(opts.db)), 'mdl_select')
        : false
      const msgs = (Array.isArray(body.messages) ? body.messages : []) as Array<Record<string, unknown>>
      for (const msg of msgs) {
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          const original = msg.content as string
          const textBefore = original.length
          const routed = routeContent(original, { mdl: mdlOn })
          if (routed.saved > 0) {
            const applied = applyCcrToRouted(original, routed.output, routed.saved, ccr)
            msg.content = applied.content
            events.push({
              lever: `content-router:${routed.compressor}`,
              tokensBefore: textBefore,
              tokensAfter: applied.content.length,
              saved: applied.saved,
              accepted: true,
              gateOutcome: applied.outcome,
            })
          } else if (mdlOn && routed.selector === 'mdl') {
            // MDL rejected a marginal compression — record the keep/drop decision.
            events.push({
              lever: 'mdl_select',
              tokensBefore: textBefore,
              tokensAfter: textBefore,
              saved: 0,
              accepted: false,
              gateOutcome: 'reverted',
            })
          }
        }
      }
    }

    if (cavemanEnabled && plan.cavemanInput) {
      const mode: CavemanMode = getCavemanMode({ cavemanMode: process.env.CAVEMAN_MODE ?? null })
      // IB gate (opt-in `info_bottleneck` lever): accept a caveman squeeze only
      // when `compressionRate − β·infoLoss ≥ 0` — i.e. the token savings outweigh
      // the predictive-information lost (token-recall proxy).
      const ibOn = opts.db
        ? isLeverEnabled(resolveEconomyLeversConfig(economyLeversSourceFromDb(opts.db)), 'info_bottleneck')
        : false
      const msgs = (Array.isArray(body.messages) ? body.messages : []) as Array<Record<string, unknown>>
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i]
        if (msg.role === 'user' && typeof msg.content === 'string') {
          const textBefore = (msg.content as string).length
          let ibScore: number | undefined
          const result = await applyLossyTransform({
            original: msg.content as string,
            transform: (s: string) => cavemanFilterInput(s, mode),
            kind: 'nl',
            verify: ibOn
              ? (orig: string, cand: string): boolean => {
                  ibScore = informationBottleneckScore({
                    tokensBefore: orig.length,
                    tokensAfter: cand.length,
                    retainedInfo: tokenRecall(orig, cand),
                  })
                  return ibScore >= 0
                }
              : undefined,
          })
          msg.content = result.value
          if (result.saved > 0) {
            events.push({
              lever: 'caveman-input',
              tokensBefore: textBefore,
              tokensAfter: result.value.length,
              saved: result.saved,
              accepted: result.outcome === 'accepted',
              gateOutcome: result.outcome,
            })
          }
          // Record the IB adjudication (accept or reject) with its score.
          if (ibOn && ibScore !== undefined) {
            events.push({
              lever: 'info_bottleneck',
              tokensBefore: textBefore,
              tokensAfter: result.value.length,
              saved: result.outcome === 'reverted' ? 0 : result.saved,
              accepted: result.outcome === 'accepted',
              gateOutcome: result.outcome,
              score: ibScore,
            })
          }
        }
      }
    }

    // Context-diff (input cut): collapse tool messages already sent verbatim
    // earlier this session to a marker — diff-edits for the prompt context.
    if (diffEnabled) {
      const msgs = (Array.isArray(body.messages) ? body.messages : []) as Array<Record<string, unknown>>
      const chunks: ContextChunk[] = []
      const chunkMsgIndex: number[] = []
      msgs.forEach((msg, i) => {
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          chunks.push({ key: msg.content as string, text: msg.content as string })
          chunkMsgIndex.push(i)
        }
      })
      const diff = contextDiff(chunks, sessionSeen)
      for (const skipped of diff.skippedIndices) {
        const msgIdx = chunkMsgIndex[skipped]
        const original = msgs[msgIdx].content as string
        if (CONTEXT_DIFF_MARKER.length < original.length) {
          msgs[msgIdx].content = CONTEXT_DIFF_MARKER
          events.push({
            lever: 'context_diff',
            tokensBefore: original.length,
            tokensAfter: CONTEXT_DIFF_MARKER.length,
            saved: original.length - CONTEXT_DIFF_MARKER.length,
            accepted: true,
            gateOutcome: 'accepted',
          })
        }
      }
    }

    const result = await next(body)

    if (opts.db && events.length > 0) {
      const sessionId = `auto-${Date.now()}`
      for (const ev of events) {
        recordLeverEvent(opts.db, {
          surface: 'internal',
          sessionId,
          lever: ev.lever,
          tokensBefore: ev.tokensBefore,
          tokensAfter: ev.tokensAfter,
          saved: ev.saved,
          accepted: ev.accepted,
          gateOutcome: ev.gateOutcome,
          ...(ev.score !== undefined ? { score: ev.score } : {}),
        })
      }
    }

    return result
  }
}
