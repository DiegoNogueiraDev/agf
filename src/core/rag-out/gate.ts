/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-OUT recover-vs-generate gate — the central, delicate decision.
 *
 * A scaffold is structure with semantics; recovering the WRONG one is worse
 * than generating (the agent fills an inadequate skeleton and ships something
 * subtly broken). So the gate decides not just "which is similar" but "which is
 * *adequate to the goal*" — and, crucially, **when none serves**.
 *
 * Two bars must both be cleared to recover:
 *  - a global confidence threshold (caller-tunable), and
 *  - the per-scaffold `noveltyFloor` (a scaffold meant for near-identical goals
 *    sets a high floor; a goal too distant for it → generate, never force it).
 *
 * Below either bar → generate (genuinely new case). Fuses two lexical signals
 * (goal-overlap × fit-tag-overlap) with the shared RRF primitive, mirroring
 * RAG-IN — no new search infrastructure.
 */

import { computeRrfScore } from '../economy/rrf.js'
import { expand, foldDiacritics } from '../text/lexicon.js'
import type { Language } from './language.js'

export interface ScaffoldDescriptor {
  id: string
  /** What this scaffold is for ("PRD with phases and metrics"). */
  goal: string
  /** Adequacy tags used for fit scoring. */
  fitTags: string[]
  /** Holes the LLM fills after recovery. */
  slots: string[]
  /** Min fit [0,1] to justify recovering THIS scaffold (goal-distance guard). */
  noveltyFloor: number
  /** Optional pointer to the template body. */
  structureRef?: string
  /** Language this scaffold targets — recovering a mismatch is forbidden. */
  language?: Language
}

export interface ScaffoldMatch {
  scaffold: ScaffoldDescriptor
  score: number
}

export type RagOutOutcome = 'recover' | 'generate'

export interface RagOutDecision {
  decision: RagOutOutcome
  goal: string
  /** Fit [0,1] of the best scaffold to the goal. */
  confidence: number
  best: ScaffoldDescriptor | null
  candidates: ScaffoldMatch[]
  /** Why the gate decided as it did. */
  reason: string
}

export interface GateOptions {
  /** Global confidence bar; recovery also requires clearing noveltyFloor. */
  threshold?: number
  k?: number
  /** Project language — a scaffold of a different language is never recovered. */
  projectLanguage?: Language
  /**
   * Sinais de corpus github cacheado, por id de scaffold (node_b3cca8d17450).
   * Usado só como DESEMPATE quando o fit-score lexical já empata — nunca muda
   * o score primário, então {} ou ausente é byte-idêntico ao comportamento
   * de sempre (regressivo-seguro).
   */
  corpusSignals?: Partial<Record<string, number>>
  /**
   * Tokens of the structure this scaffold would hand over, or null when it cannot be produced.
   * A port: the gate never touches the filesystem. Omit it and the gate behaves as it always did —
   * which is to say, it will recover a skeleton that does not exist.
   */
  structureTokensOf?: (scaffold: ScaffoldDescriptor) => number | null
}

const DEFAULT_THRESHOLD = 0.5
const DEFAULT_K = 3

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'with',
  'into',
  'build',
  'write',
  'create',
  'make',
  'about',
  'using',
  'use',
  'that',
  'at',
  'all',
  'um',
  'uma',
  'o',
  'os',
  'as',
  'de',
  'da',
  'do',
  'em',
  'para',
  'e',
  'com',
  // `que` counted as a goal concept nothing could ever cover, so it taxed every score by 1/n.
  // "função pura que calcula uma expressão" was six concepts where five were asked.
  'que',
])

function tokenize(text: string): string[] {
  // Fold before splitting, or the split eats the accent and the word with it: `função pura
  // expressão` became `fun | o | pura | express | o`, five tokens of which three are noise. The
  // `formula` scaffold, which answers that goal almost word for word, scored 0.43 against a
  // 0.5 bar and the model wrote it from scratch instead.
  return foldDiacritics(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t))
}

/**
 * One group per goal concept: the word someone typed and what it means in the other language.
 * Scaffold goals are written in Portuguese, their `fitTags` in English — `compute` is what
 * `calcula` is asking for. Same lexicon RAG-IN uses; a shared map of language, not of commands.
 */
function conceptGroups(goal: string): string[][] {
  return contentTokens(goal).map((token) => [...expand(token)])
}

/** Fraction of goal concepts covered — a concept counts when any of its spellings appears. */
function coverage(concepts: readonly string[][], tokens: Set<string>): number {
  if (concepts.length === 0) return 0
  const matched = concepts.filter((group) => group.some((term) => tokens.has(term))).length
  return matched / concepts.length
}

function ranksFromScores(scores: number[]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i)
  const rank = new Array<number>(scores.length).fill(0)
  order.forEach((o, idx) => {
    rank[o.i] = o.s > 0 ? idx + 1 : 0
  })
  return rank
}

export function decideScaffold(
  goal: string,
  corpus: readonly ScaffoldDescriptor[],
  opts: GateOptions = {},
): RagOutDecision {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const k = opts.k ?? DEFAULT_K

  if (corpus.length === 0) {
    return { decision: 'generate', goal, confidence: 0, best: null, candidates: [], reason: 'no_scaffolds_in_corpus' }
  }

  // Language pre-filter: exclude scaffolds of a different language before scoring.
  // Scaffolds with no language tag are always eligible (fit-only behavior).
  const eligible =
    opts.projectLanguage && opts.projectLanguage !== 'unknown'
      ? corpus.filter((s) => !s.language || s.language === opts.projectLanguage)
      : corpus

  if (eligible.length === 0) {
    return {
      decision: 'generate',
      goal,
      confidence: 0,
      best: null,
      candidates: [],
      reason: `no_scaffold_for_language(${opts.projectLanguage})`,
    }
  }

  const goalTerms = conceptGroups(goal)

  // Signal 1: coverage of goal terms by the scaffold's goal text.
  // Signal 2: coverage of goal terms by the scaffold's fit tags.
  const goalScores = eligible.map((s) => coverage(goalTerms, new Set(tokenize(s.goal))))
  const tagScores = eligible.map((s) => coverage(goalTerms, new Set(s.fitTags.flatMap((t) => tokenize(t)))))

  const goalRanks = ranksFromScores(goalScores)
  const tagRanks = ranksFromScores(tagScores)

  // Sinal de corpus github (node_b3cca8d17450): um empate lexical *exato* nunca
  // ocorre no RRF (ranksFromScores desempata por índice antes da fusão), então o
  // sinal precisa somar diretamente ao score — pequeno o bastante (cap 0.005)
  // para só virar o pequeno gap induzido por esse desempate por índice, não uma
  // diferença de fit real (gaps de rank genuínos são bem maiores). {} ou
  // ausente ⇒ boost 0 para todos ⇒ score idêntico ao de sempre.
  const SIGNAL_BOOST_PER_COUNT = 0.0005
  const SIGNAL_BOOST_CAP = 0.005

  const matches: ScaffoldMatch[] = eligible.map((scaffold, i) => {
    const rrf = computeRrfScore(
      { bm25Rank: goalRanks[i], vectorRank: tagRanks[i], graphRank: 0 },
      { k: 60, weights: { bm25: 0.5, vector: 0.5, graph: 0 } },
    )
    const signalCount = opts.corpusSignals?.[scaffold.id] ?? 0
    const boost = signalCount > 0 ? Math.min(signalCount * SIGNAL_BOOST_PER_COUNT, SIGNAL_BOOST_CAP) : 0
    return { scaffold, score: rrf + boost }
  })

  const ranked = matches.filter((m) => m.score > 0).sort((a, b) => b.score - a.score)
  const candidates = ranked.slice(0, k)
  const best = candidates[0]?.scaffold ?? null

  if (!best) {
    return { decision: 'generate', goal, confidence: 0, best: null, candidates, reason: 'no_lexical_match' }
  }

  // Confidence = best scaffold's adequacy (max of its two coverage signals).
  const bestIdx = eligible.indexOf(best)
  const confidence = Math.max(goalScores[bestIdx], tagScores[bestIdx])

  // Language guard: never recover a scaffold of a different language than the
  // project (a Python repo must not get a TypeScript skeleton). 'unknown' or an
  // untagged scaffold skips the guard (fit-only behavior).
  if (
    opts.projectLanguage &&
    opts.projectLanguage !== 'unknown' &&
    best.language &&
    best.language !== opts.projectLanguage
  ) {
    return {
      decision: 'generate',
      goal,
      confidence,
      best,
      candidates,
      reason: `language_mismatch(${best.language}≠${opts.projectLanguage})`,
    }
  }

  // Third bar, checked first because it is not a matter of degree: a scaffold whose structure
  // cannot be produced has nothing to recover. Nine of the thirteen `structureRef`s pointed at
  // `templates/*.md` files that are not on disk, and the gate cheerfully recovered them — naming
  // a skeleton, listing its slots, and billing the agent for boilerplate it never received.
  // Injected rather than read here: gate.ts stays pure, and the caller owns the filesystem.
  if (opts.structureTokensOf && opts.structureTokensOf(best) === null) {
    return {
      decision: 'generate',
      goal,
      confidence,
      best,
      candidates,
      reason: `structure_unavailable(${best.structureRef ?? 'no_ref'})`,
    }
  }

  // Two bars: global threshold AND the scaffold's own novelty_floor.
  if (confidence < threshold) {
    return { decision: 'generate', goal, confidence, best, candidates, reason: `below_threshold(${threshold})` }
  }
  if (confidence < best.noveltyFloor) {
    return {
      decision: 'generate',
      goal,
      confidence,
      best,
      candidates,
      reason: `below_novelty_floor(${best.noveltyFloor})`,
    }
  }

  return { decision: 'recover', goal, confidence, best, candidates, reason: 'fit_above_bar' }
}
