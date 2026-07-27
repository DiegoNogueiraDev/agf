/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Preflight guard — the "golden rule" as deterministic code. Before any work
 * starts, surface (a) git history state (branch, ahead/behind, dirty, stash,
 * topic-matching commits) and (b) graph dedupe (existing nodes on the same
 * topic + current WIP). Verdict tells the driver whether it is safe to proceed
 * or whether it risks duplicating in-flight or already-shipped work.
 *
 * Pure core: `computePreflightVerdict` has zero I/O. `runPreflight` composes
 * two injectable ports (GitProbe, GraphProbe) so the whole flow is unit-testable
 * without a real git repo or store; the CLI wires the real adapters.
 */

export type PreflightVerdict = 'safe' | 'duplicate-risk' | 'wip-conflict' | 'dirty-tree'

/** An existing graph node that textually matches the topic being started. */
export interface DedupeHit {
  id: string
  title: string
  status: string
  score: number
}

/** Git-history snapshot relevant to the dedupe decision. */
export interface PreflightGit {
  branch: string | null
  ahead: number
  behind: number
  dirtyCount: number
  stashCount: number
  recentMatches: Array<{ hash: string; subject: string }>
}

/** Everything the pure verdict function needs — no I/O. */
export interface PreflightInputs {
  git: PreflightGit
  dedupeHits: DedupeHit[]
  wipNodes: Array<{ id: string; title: string }>
}

export interface PreflightReport extends PreflightInputs {
  topic: string | null
  verdict: PreflightVerdict
  findings: string[]
}

/** Port: git-history probing (impure; injected). */
export interface GitProbe {
  branch(cwd?: string): string | null
  aheadBehind(cwd?: string): { ahead: number; behind: number }
  dirtyCount(cwd?: string): number
  stashCount(cwd?: string): number
  commitsMatching(topic: string, cwd?: string): Array<{ hash: string; subject: string }>
}

/** Port: graph dedupe + WIP lookup (impure; injected). */
export interface GraphProbe {
  findDuplicates(topic: string): DedupeHit[]
  listWip(): Array<{ id: string; title: string }>
}

const ACTIVE_DUP_STATES = new Set(['in_progress'])
const KNOWN_DUP_STATES = new Set(['done', 'backlog', 'ready', 'in_progress'])

/**
 * Decide the preflight verdict from already-collected inputs. Severity order
 * (highest wins): wip-conflict > duplicate-risk > dirty-tree > safe. All present
 * signals are emitted as findings regardless of the winning verdict.
 */
export function computePreflightVerdict(inp: PreflightInputs): { verdict: PreflightVerdict; findings: string[] } {
  const findings: string[] = []

  for (const h of inp.dedupeHits) {
    const flag = ACTIVE_DUP_STATES.has(h.status) ? '⛔' : '⚠'
    findings.push(`${flag} possível duplicata: ${h.id} "${h.title}" [${h.status}]`)
  }
  if (inp.git.ahead > 0) findings.push(`⚠ ${inp.git.ahead} commit(s) local(is) não pushado(s) para o origin`)
  if (inp.git.behind > 0) findings.push(`⚠ ${inp.git.behind} commit(s) atrás do origin — faça pull antes`)
  if (inp.git.dirtyCount > 0) findings.push(`⚠ ${inp.git.dirtyCount} arquivo(s) não-commitado(s) na árvore`)
  if (inp.git.stashCount > 0) findings.push(`⚠ ${inp.git.stashCount} stash(es) pendente(s)`)
  if (inp.git.recentMatches.length > 0)
    findings.push(`ℹ ${inp.git.recentMatches.length} commit(s) recente(s) mencionam o tópico`)
  if (inp.wipNodes.length > 0)
    findings.push(`ℹ WIP atual (WIP=1): ${inp.wipNodes.map((w) => `${w.id} "${w.title}"`).join(', ')}`)

  const hasActiveDup = inp.dedupeHits.some((h) => ACTIVE_DUP_STATES.has(h.status))
  const hasKnownDup = inp.dedupeHits.some((h) => KNOWN_DUP_STATES.has(h.status))
  const dirty = inp.git.ahead > 0 || inp.git.dirtyCount > 0 || inp.git.stashCount > 0

  let verdict: PreflightVerdict = 'safe'
  if (hasActiveDup) verdict = 'wip-conflict'
  else if (hasKnownDup) verdict = 'duplicate-risk'
  else if (dirty) verdict = 'dirty-tree'

  return { verdict, findings }
}

/**
 * Resolve the topic to dedupe against: an explicit topic wins; otherwise fall
 * back to the linked node's title. Returns null when neither yields content.
 */
export function deriveTopic(explicit?: string | null, nodeTitle?: string | null): string | null {
  const e = explicit?.trim()
  if (e) return e
  const t = nodeTitle?.trim()
  return t && t.length > 0 ? t : null
}

export interface RunPreflightOptions {
  topic?: string | null
  cwd?: string
  /** Node id to exclude from its own duplicate hits. */
  nodeId?: string
  git: GitProbe
  graph: GraphProbe
}

/** Compose the git + graph probes into a full preflight report. */
export function runPreflight(opts: RunPreflightOptions): PreflightReport {
  const topic = opts.topic && opts.topic.trim().length > 0 ? opts.topic.trim() : null

  const { ahead, behind } = opts.git.aheadBehind(opts.cwd)
  const git: PreflightGit = {
    branch: opts.git.branch(opts.cwd),
    ahead,
    behind,
    dirtyCount: opts.git.dirtyCount(opts.cwd),
    stashCount: opts.git.stashCount(opts.cwd),
    recentMatches: topic ? opts.git.commitsMatching(topic, opts.cwd) : [],
  }

  const dedupeHits = topic ? opts.graph.findDuplicates(topic).filter((h) => h.id !== opts.nodeId) : []
  const wipNodes = opts.graph.listWip()

  const inputs: PreflightInputs = { git, dedupeHits, wipNodes }
  const { verdict, findings } = computePreflightVerdict(inputs)
  return { topic, ...inputs, verdict, findings }
}
